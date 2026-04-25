/**
 * 远程配置防退化回归测试
 *
 * 负责：
 * - 验证旧 cache 不再覆盖新版 packaged
 * - 验证旧 jsDelivr 不再阻断 GitHub Raw 新版
 * - 验证 GPT-5.5 定价可被费用计算模块命中
 *
 * @module 自动化测试/V1.5.3/tests/remote-config-anti-regression
 */

import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import pricingData from '../../../src/config/pricing.json'
import { calculateCosts } from '../../../src/store/costCalculator.js'

const require = createRequire(import.meta.url)
const loaderPath = path.resolve(process.cwd(), 'electron/services/remoteConfigLoader.js')

/**
 * 重新加载 loader，避免模块级 registryStore 污染用例
 * @returns {object} remoteConfigLoader 模块
 */
function loadFreshLoader() {
  delete require.cache[loaderPath]
  return require(loaderPath)
}

/**
 * 创建用于 remote-config 测试的最小 registry spec
 * @param {object} overrides - 覆盖字段
 * @returns {object} registry spec
 */
function createSpec(overrides = {}) {
  return {
    name: 'test-config',
    remotePath: 'src/config/test-config.json',
    cacheFileName: 'test-config.cache.json',
    packaged: {
      version: '2026-04-25',
      items: ['packaged'],
    },
    hardcoded: {
      version: 'hardcoded',
      items: ['hardcoded'],
    },
    validate: (data) => {
      if (!data || typeof data !== 'object' || !Array.isArray(data.items)) {
        return { valid: false, error: 'items 必须是数组' }
      }
      return { valid: true }
    },
    ...overrides,
  }
}

/**
 * 构造 fetch mock 响应
 * @param {object} body - JSON body
 * @returns {Promise<{ok: boolean, json: Function}>}
 */
function okJson(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
}

describe('V1.5.3 remote-config 防退化', () => {
  /** @type {string} */
  let tmpDir

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'remote-config-v153-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    vi.restoreAllMocks()
  })

  it('旧 cache 不应覆盖新版 packaged，并应自愈 cache 文件', async () => {
    const loader = loadFreshLoader()
    const spec = createSpec()
    const cacheFile = path.join(tmpDir, spec.cacheFileName)
    await fs.writeFile(
      cacheFile,
      JSON.stringify({ version: '2026-04-18', items: ['stale-cache'] }),
      'utf-8'
    )

    const result = await loader.loadEffective(spec, cacheFile)

    expect(result.source).toBe('packaged')
    expect(result.config.version).toBe('2026-04-25')
    expect(result.config.items).toEqual(['packaged'])

    const healedCache = JSON.parse(await fs.readFile(cacheFile, 'utf-8'))
    expect(healedCache.version).toBe('2026-04-25')
    expect(healedCache.items).toEqual(['packaged'])
  })

  it('新版 cache 仍应优先于 packaged', async () => {
    const loader = loadFreshLoader()
    const spec = createSpec()
    const cacheFile = path.join(tmpDir, spec.cacheFileName)
    await fs.writeFile(
      cacheFile,
      JSON.stringify({ version: '2099-12-31', items: ['future-cache'] }),
      'utf-8'
    )

    const result = await loader.loadEffective(spec, cacheFile)

    expect(result.source).toBe('cache')
    expect(result.config.version).toBe('2099-12-31')
    expect(result.config.items).toEqual(['future-cache'])
  })

  it('jsDelivr 返回旧版本时应继续尝试 GitHub Raw', async () => {
    const loader = loadFreshLoader()
    const spec = createSpec()
    const staleRemote = { version: '2026-04-18', items: ['jsdelivr-stale'] }
    const freshRemote = { version: '2026-04-25', items: ['github-raw-fresh'] }
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => okJson(staleRemote))
      .mockImplementationOnce(() => okJson(freshRemote))

    const result = await loader.fetchRemote(spec)

    expect(result.success).toBe(true)
    expect(result.source).toContain('raw.githubusercontent.com')
    expect(result.config.items).toEqual(['github-raw-fresh'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('所有远程源都旧时不应写入 cache', async () => {
    const loader = loadFreshLoader()
    const spec = createSpec()
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      okJson({ version: '2026-04-18', items: ['stale-remote'] })
    )

    const result = await loader.refreshRemoteConfigInBackground(spec, {
      getUserDataPath: () => tmpDir,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('REMOTE_VERSION_STALE')
    await expect(fs.access(path.join(tmpDir, spec.cacheFileName))).rejects.toThrow()
  })
})

describe('V1.5.3 GPT-5.5 定价命中', () => {
  it('pricing.json 应包含 GPT-5.5 标准短上下文价格', () => {
    expect(pricingData.version).toBe('2026-04-25')
    expect(pricingData.models['gpt-5-5']).toEqual({
      displayName: 'GPT-5.5',
      input: 5,
      output: 30,
      cacheRead: 0.5,
      cacheWrite: 0,
    })
  })

  it('costCalculator 应能把 gpt-5.5 算出具体费用', () => {
    const result = calculateCosts([
      {
        name: 'gpt-5.5',
        input: 1_500_000,
        output: 115_700,
        cacheRead: 30_700_000,
        cacheCreate: 0,
      },
    ])

    expect(result.totalCost).not.toBeNull()
    expect(result.totalCost).toBeCloseTo(26.321, 3)
    expect(result.modelCosts.get('gpt-5.5')).toBeCloseTo(26.321, 3)
  })

  it('未知模型仍应显示为未知费用', () => {
    const result = calculateCosts([
      {
        name: 'unknown-model',
        input: 1_000_000,
        output: 1_000_000,
        cacheRead: 0,
        cacheCreate: 0,
      },
    ])

    expect(result.totalCost).toBeNull()
    expect(result.modelCosts.get('unknown-model')).toBeNull()
  })
})
