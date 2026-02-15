/* @vitest-environment node */

/**
 * V0.6 日志扫描模块行为测试
 *
 * 负责：
 * - 校验时间窗口过滤采用半开区间 `[start, end)`
 * - 校验扫描结果按文件修改时间倒序返回
 * - 校验大目录场景下的文件数截断与行数限制策略
 *
 * @module 自动化测试/V0.6/tests/unit/electron/logScanner.v06.behavior.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, utimes, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { scanLogFilesInRange } = require('../../../../../electron/logScanner.js')

/**
 * 创建测试文件并设置 mtime
 * @param {string} baseDir - 测试根目录
 * @param {string} relativePath - 相对路径
 * @param {Date} mtime - 文件修改时间
 * @param {string} content - 文件内容
 * @returns {Promise<string>} 文件绝对路径
 */
async function createJsonlFile(baseDir, relativePath, mtime, content) {
  const fullPath = path.join(baseDir, relativePath)
  await mkdir(path.dirname(fullPath), { recursive: true })
  await writeFile(fullPath, content, 'utf-8')
  await utimes(fullPath, mtime, mtime)
  return fullPath
}

describe('logScanner V0.6 Behavior (Node Unit)', () => {
  let sandboxDir

  beforeEach(async () => {
    sandboxDir = await mkdtemp(path.join(tmpdir(), 'skill-manager-logscan-'))
  })

  afterEach(async () => {
    await rm(sandboxDir, { recursive: true, force: true })
  })

  it('UT-BE-01: 时间窗口应按半开区间过滤（包含 start，不包含 end）', async () => {
    const start = new Date('2026-02-10T00:00:00.000Z')
    const end = new Date('2026-02-11T00:00:00.000Z')

    await createJsonlFile(
      sandboxDir,
      'a/at-start.jsonl',
      new Date('2026-02-10T00:00:00.000Z'),
      '{"line":"at-start"}\n'
    )
    await createJsonlFile(
      sandboxDir,
      'a/in-window.jsonl',
      new Date('2026-02-10T12:00:00.000Z'),
      '{"line":"in-window"}\n'
    )
    await createJsonlFile(
      sandboxDir,
      'a/at-end.jsonl',
      new Date('2026-02-11T00:00:00.000Z'),
      '{"line":"at-end"}\n'
    )

    const result = await scanLogFilesInRange(sandboxDir, start, end)

    const names = result.files.map(file => path.basename(file.path))
    expect(names).toContain('at-start.jsonl')
    expect(names).toContain('in-window.jsonl')
    expect(names).not.toContain('at-end.jsonl')
    expect(result.totalMatched).toBe(2)
    expect(result.truncated).toBe(false)
  })

  it('UT-BE-02: 当触发 maxFiles 限制时，应按 mtime 倒序保留最新文件', async () => {
    const start = new Date('2026-02-01T00:00:00.000Z')
    const end = new Date('2026-03-01T00:00:00.000Z')

    await createJsonlFile(
      sandboxDir,
      'logs/oldest.jsonl',
      new Date('2026-02-10T00:00:00.000Z'),
      '{"id":"oldest"}\n'
    )
    await createJsonlFile(
      sandboxDir,
      'logs/middle.jsonl',
      new Date('2026-02-11T00:00:00.000Z'),
      '{"id":"middle"}\n'
    )
    await createJsonlFile(
      sandboxDir,
      'logs/newest.jsonl',
      new Date('2026-02-12T00:00:00.000Z'),
      '{"id":"newest"}\n'
    )

    const result = await scanLogFilesInRange(sandboxDir, start, end, {
      maxFiles: 2
    })

    const names = result.files.map(file => path.basename(file.path))
    expect(names).toEqual(['newest.jsonl', 'middle.jsonl'])
    expect(result.totalMatched).toBe(3)
    expect(result.scannedCount).toBe(2)
    expect(result.truncated).toBe(true)
  })

  it('UT-BE-03: 单文件读取应过滤空行并执行 maxLinesPerFile 限制', async () => {
    const start = new Date('2026-02-01T00:00:00.000Z')
    const end = new Date('2026-03-01T00:00:00.000Z')

    await createJsonlFile(
      sandboxDir,
      'logs/with-lines.jsonl',
      new Date('2026-02-15T00:00:00.000Z'),
      '{"id":1}\n\n{"id":2}\n{"id":3}\n'
    )

    const result = await scanLogFilesInRange(sandboxDir, start, end, {
      maxLinesPerFile: 2
    })

    expect(result.files).toHaveLength(1)
    expect(result.files[0].lines).toEqual(['{"id":1}', '{"id":2}'])
  })
})

