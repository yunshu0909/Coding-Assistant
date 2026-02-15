/* @vitest-environment node */

/**
 * V0.6 日志扫描处理器异常测试
 *
 * 负责：
 * - 校验目录不存在时返回 success + 空数据
 * - 校验权限异常映射为 PERMISSION_DENIED
 * - 校验正常路径透传扫描结果
 *
 * @module 自动化测试/V0.6/tests/unit/electron/scanLogFilesHandler.v06.error-handling.test
 */

import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { handleScanLogFiles } = require('../../../../../electron/scanLogFilesHandler.js')

describe('scanLogFilesHandler V0.6 Error Handling (Node Unit)', () => {
  it('UT-BE-SCAN-01: 目录不存在时应返回 success + 空数据', async () => {
    const result = await handleScanLogFiles(
      {
        basePath: '~/.claude/projects',
        start: '2026-02-15T00:00:00.000Z',
        end: '2026-02-15T01:00:00.000Z'
      },
      {
        expandHomeFn: vi.fn(() => '/tmp/claude-projects'),
        pathExistsFn: vi.fn(async () => false),
        scanLogFilesInRangeFn: vi.fn()
      }
    )

    expect(result).toEqual({
      success: true,
      files: [],
      totalMatched: 0,
      scannedCount: 0,
      truncated: false,
      error: null
    })
  })

  it('UT-BE-SCAN-02: 扫描抛出 EACCES 时应返回 PERMISSION_DENIED', async () => {
    const result = await handleScanLogFiles(
      {
        basePath: '~/.claude/projects',
        start: '2026-02-15T00:00:00.000Z',
        end: '2026-02-15T01:00:00.000Z'
      },
      {
        expandHomeFn: vi.fn(() => '/tmp/claude-projects'),
        pathExistsFn: vi.fn(async () => true),
        scanLogFilesInRangeFn: vi.fn(async () => {
          const error = new Error('permission denied')
          error.code = 'EACCES'
          throw error
        })
      }
    )

    expect(result).toEqual({
      success: false,
      files: [],
      totalMatched: 0,
      scannedCount: 0,
      truncated: false,
      error: 'PERMISSION_DENIED'
    })
  })

  it('UT-BE-SCAN-03: 正常扫描时应透传 files 与统计字段', async () => {
    const result = await handleScanLogFiles(
      {
        basePath: '~/.codex/sessions',
        start: '2026-02-15T00:00:00.000Z',
        end: '2026-02-15T01:00:00.000Z'
      },
      {
        expandHomeFn: vi.fn(() => '/tmp/codex-sessions'),
        pathExistsFn: vi.fn(async () => true),
        scanLogFilesInRangeFn: vi.fn(async () => ({
          files: [{ path: '/tmp/codex-sessions/a.jsonl', lines: ['{"ok":1}'], mtime: '2026-02-15T00:10:00.000Z' }],
          totalMatched: 12,
          scannedCount: 10,
          truncated: true
        }))
      }
    )

    expect(result).toEqual({
      success: true,
      files: [{ path: '/tmp/codex-sessions/a.jsonl', lines: ['{"ok":1}'], mtime: '2026-02-15T00:10:00.000Z' }],
      totalMatched: 12,
      scannedCount: 10,
      truncated: true,
      error: null
    })
  })
})
