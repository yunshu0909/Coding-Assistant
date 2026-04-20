/**
 * Registry 打包配置行为测试
 *
 * 负责：
 * - 校验打包配置 JSON 的安全读取行为
 * - 防止缺失 src/config/*.json 时在 require 阶段直接崩溃
 * - 守住 electron-builder 必须包含注册表 JSON 的发布约束
 *
 * @module 自动化测试/V0.16/tests/backend/registryPackaging.behavior.test
 */

import path from 'node:path'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, it, expect } from 'vitest'

const require = createRequire(import.meta.url)

const helperPath = path.resolve(
  process.cwd(),
  'electron/services/registries/loadPackagedJson.js'
)
const packageJsonPath = path.resolve(process.cwd(), 'package.json')

/**
 * 重新加载 helper，避免 require cache 污染测试结果
 * @returns {{ loadPackagedJson: (relativePath: string) => object|null }}
 */
function loadFresh() {
  delete require.cache[helperPath]
  return require(helperPath)
}

describe('registry packaging', () => {
  describe('loadPackagedJson', () => {
    it('存在的配置文件应被正常读取', () => {
      const { loadPackagedJson } = loadFresh()
      const result = loadPackagedJson('src/config/model-registry.json')

      expect(result).toBeTruthy()
      expect(Array.isArray(result.models)).toBe(true)
      expect(Array.isArray(result.effortLevels)).toBe(true)
    })

    it('缺失的配置文件应返回 null 而不是抛异常', () => {
      const { loadPackagedJson } = loadFresh()

      expect(() => loadPackagedJson('src/config/__missing__.json')).not.toThrow()
      expect(loadPackagedJson('src/config/__missing__.json')).toBeNull()
    })
  })

  describe('electron-builder files', () => {
    it('必须把 src/config 下的 JSON 打进安装包', () => {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
      expect(packageJson.build?.files).toContain('src/config/**/*.json')
    })
  })
})
