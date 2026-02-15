/**
 * V0.6 用量聚合 PRD 口径测试
 *
 * 负责：
 * - 校验今日/近7天/近30天时间窗口与 PRD 一致
 * - 校验记录过滤使用半开区间 `[start, end)`
 * - 校验总消耗为 0 的模型不会进入展示结果
 *
 * @module 自动化测试/V0.6/tests/unit/store/usageAggregator.v06.prd-window.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { aggregateUsage } from '@/store/usageAggregator.js'

/**
 * 构造 Claude 日志行
 * @param {{timestamp: string, model: string, input?: number, output?: number, cacheRead?: number, cacheCreate?: number}} payload - 日志字段
 * @returns {string}
 */
function buildClaudeLogLine(payload) {
  return JSON.stringify({
    timestamp: payload.timestamp,
    message: {
      model: payload.model,
      usage: {
        input_tokens: payload.input ?? 0,
        output_tokens: payload.output ?? 0,
        cache_read_input_tokens: payload.cacheRead ?? 0,
        cache_creation_input_tokens: payload.cacheCreate ?? 0
      }
    }
  })
}

describe('usageAggregator PRD Window (Unit)', () => {
  const scanLogFilesMock = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    // 锁定北京时间 2026-02-15 11:00，便于验证窗口边界
    vi.setSystemTime(new Date('2026-02-15T03:00:00.000Z'))

    scanLogFilesMock.mockReset()

    const claudeLines = [
      // 今日窗口内（today 应包含）
      buildClaudeLogLine({
        timestamp: '2026-02-15T00:00:00+08:00',
        model: 'claude-sonnet-4-5',
        input: 10,
        output: 5
      }),
      buildClaudeLogLine({
        timestamp: '2026-02-15T01:00:00+08:00',
        model: 'claude-opus-4-1',
        input: 20,
        output: 10
      }),
      // week 起始边界（week 应包含）
      buildClaudeLogLine({
        timestamp: '2026-02-08T00:00:00+08:00',
        model: 'kimi',
        input: 30,
        output: 0
      }),
      // week/month 公共窗口（week/month 应包含）
      buildClaudeLogLine({
        timestamp: '2026-02-14T23:59:59+08:00',
        model: 'codex',
        input: 40,
        output: 0
      }),
      // month 起始边界（month 应包含）
      buildClaudeLogLine({
        timestamp: '2026-01-16T00:00:00+08:00',
        model: 'deepseek',
        input: 50,
        output: 0
      }),
      // 零消耗模型（不应进入展示）
      buildClaudeLogLine({
        timestamp: '2026-02-15T12:00:00+08:00',
        model: 'gpt-4',
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheCreate: 0
      })
    ]

    scanLogFilesMock.mockImplementation(async ({ basePath }) => {
      if (basePath === '~/.claude/projects') {
        return {
          success: true,
          files: [
            {
              path: '/tmp/mock-claude.jsonl',
              lines: claudeLines,
              mtime: '2026-02-15T03:00:00.000Z'
            }
          ],
          totalMatched: 1,
          scannedCount: 1,
          truncated: false,
          error: null
        }
      }

      // codex 路径返回空，避免对当前用例造成干扰
      return {
        success: true,
        files: [],
        totalMatched: 0,
        scannedCount: 0,
        truncated: false,
        error: null
      }
    })

    globalThis.window = {
      electronAPI: {
        scanLogFiles: scanLogFilesMock
      }
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('UT-AGG-01: today 应为 [今日00:00, 当前时刻)', async () => {
    const result = await aggregateUsage('today')
    expect(result.success).toBe(true)

    // 包含 00:00 与 01:00 两条今日记录
    expect(result.data.recordCount).toBe(2)
    expect(result.data.total).toBe(45)
    expect(result.data.models.map(model => model.name)).toEqual(['opus', 'sonnet'])
  })

  it('UT-AGG-02: week 应为 [今日-7天00:00, 今日00:00) 且不含今日', async () => {
    const result = await aggregateUsage('week')
    expect(result.success).toBe(true)

    // 应包含 02-08 00:00 与 02-14 23:59:59；不含 02-15 00:00/01:00
    expect(result.data.recordCount).toBe(2)
    expect(result.data.total).toBe(70)
    expect(result.data.models.map(model => model.name)).toEqual(['codex', 'kimi'])
  })

  it('UT-AGG-03: month 应为 [今日-30天00:00, 今日00:00) 且包含 month 起始边界', async () => {
    const result = await aggregateUsage('month')
    expect(result.success).toBe(true)

    // 应包含 01-16 00:00 + week 内两条；不含 02-15 当日两条
    expect(result.data.recordCount).toBe(3)
    expect(result.data.total).toBe(120)
    expect(result.data.models.map(model => model.name)).toEqual(['deepseek', 'codex', 'kimi'])
  })

  it('UT-AGG-04: 非法周期应返回 INVALID_PERIOD', async () => {
    const result = await aggregateUsage('invalid-period')
    expect(result).toEqual({
      success: false,
      error: 'INVALID_PERIOD'
    })
  })
})
