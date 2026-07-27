/**
 * V1.9.13 Codex 额度窗口口径测试
 *
 * 负责：
 * - 额度行由 windows 数据驱动：账号有几个窗口就渲染几条，标签从 windowMinutes 推出
 * - 回归「周额度被贴成 5 小时额度」：31% + 6 天后重置只能落在 7 天额度行
 * - 回归「没有的窗口渲染成绿色 0%」：null 百分比不成行，0% 仍是合法值
 *
 * @module 自动化测试/V1.9.13/tests/codexQuotaWindows.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CodexUsageColumn from '../../../src/pages/usage/components/CodexUsageColumn'
import ClaudeUsageColumn from '../../../src/pages/usage/components/ClaudeUsageColumn'
import { formatWindowLabel, hasPercentValue } from '../../../src/pages/usage/components/usageColumnKit'

const NOW = new Date('2026-07-27T23:11:00+08:00')
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000)
const SIX_DAYS_LATER = NOW_SECONDS + 6 * 86400 + 11 * 3600

/**
 * 造一个 Codex ready 状态
 * @param {Array<object>} windows - 归一化窗口数组
 * @param {object} [extra] - 额外快照字段（兼容字段等）
 * @returns {object}
 */
function codexState(windows, extra = {}) {
  return {
    integrationState: 'ready',
    snapshot: { windows, updatedAt: NOW_SECONDS, hasRateLimits: windows.length > 0, ...extra },
  }
}

/** 取当前渲染出的所有额度行文本 */
function rowTexts(container) {
  return [...container.querySelectorAll('.usage-row')].map((row) => row.textContent)
}

describe('V1.9.13 Codex 额度窗口口径', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('W-TC-01: 新格式只有一个 7 天窗口 → 只渲染一条「7 天额度」', () => {
    const { container } = render(
      <CodexUsageColumn
        statusState={codexState([{ windowMinutes: 10080, usedPercent: 31, resetsAt: SIX_DAYS_LATER }])}
        loading={false}
      />
    )

    expect(rowTexts(container)).toHaveLength(1)
    expect(screen.getByText('7 天额度')).toBeInTheDocument()
    expect(screen.queryByText('5 小时额度')).not.toBeInTheDocument()
  })

  it('W-TC-02: 周额度百分比与重置时间落在 7 天额度行（防再次错位）', () => {
    const { container } = render(
      <CodexUsageColumn
        statusState={codexState([{ windowMinutes: 10080, usedPercent: 31, resetsAt: SIX_DAYS_LATER }])}
        loading={false}
      />
    )

    const [weeklyRow] = rowTexts(container)
    expect(weeklyRow).toContain('7 天额度')
    expect(weeklyRow).toContain('31%')
    expect(weeklyRow).toContain('6 天 11h')
  })

  it('W-TC-03: 老格式两个窗口 → 5 小时在前、7 天在后，两条都渲染', () => {
    const { container } = render(
      <CodexUsageColumn
        statusState={codexState([
          { windowMinutes: 300, usedPercent: 26, resetsAt: NOW_SECONDS + 3600 },
          { windowMinutes: 10080, usedPercent: 41, resetsAt: SIX_DAYS_LATER },
        ])}
        loading={false}
      />
    )

    const rows = rowTexts(container)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain('5 小时额度')
    expect(rows[0]).toContain('26%')
    expect(rows[1]).toContain('7 天额度')
    expect(rows[1]).toContain('41%')
  })

  it('W-TC-04: 没有窗口数据时不渲染任何额度行，不出现假的 0%', () => {
    const { container } = render(<CodexUsageColumn statusState={codexState([])} loading={false} />)

    expect(rowTexts(container)).toHaveLength(0)
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
  })

  it('W-TC-05: 0% 是真实值，仍要成行', () => {
    const { container } = render(
      <CodexUsageColumn
        statusState={codexState([{ windowMinutes: 10080, usedPercent: 0, resetsAt: SIX_DAYS_LATER }])}
        loading={false}
      />
    )

    expect(rowTexts(container)).toHaveLength(1)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('W-TC-06: Claude 兼容路径同样不把缺失窗口画成 0%', () => {
    const claudeState = {
      integrationState: 'ready',
      config: { displayMode: 'always' },
      snapshot: {
        hasRateLimits: true,
        updatedAt: NOW_SECONDS,
        fiveHourUsedPercentage: null,
        resetsAt: null,
        sevenDayUsedPercentage: 34,
        sevenDayResetsAt: SIX_DAYS_LATER,
      },
    }

    const { container } = render(<ClaudeUsageColumn statusState={claudeState} loading={false} />)

    const rows = rowTexts(container)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toContain('7 天额度')
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
  })

  it('W-TC-07: Claude 双窗口快照仍渲染两条（无 windows 字段的兼容路径）', () => {
    const claudeState = {
      integrationState: 'ready',
      config: { displayMode: 'always' },
      snapshot: {
        hasRateLimits: true,
        updatedAt: NOW_SECONDS,
        fiveHourUsedPercentage: 12,
        resetsAt: NOW_SECONDS + 3600,
        sevenDayUsedPercentage: 34,
        sevenDayResetsAt: SIX_DAYS_LATER,
      },
    }

    const { container } = render(<ClaudeUsageColumn statusState={claudeState} loading={false} />)
    expect(rowTexts(container)).toHaveLength(2)
  })
})

describe('V1.9.13 窗口标签与有效值判定', () => {
  it('W-TC-08: 标签由 window_minutes 推出，未来新窗口不写死也能显示', () => {
    expect(formatWindowLabel(300)).toBe('5 小时额度')
    expect(formatWindowLabel(10080)).toBe('7 天额度')
    expect(formatWindowLabel(1440)).toBe('1 天额度')
    expect(formatWindowLabel(43200)).toBe('30 天额度')
    expect(formatWindowLabel(90)).toBe('90 分钟额度')
  })

  it('W-TC-09: 窗口长度缺失 → 中性标签，不假装是某个具体窗口', () => {
    expect(formatWindowLabel(null)).toBe('当前额度')
    expect(formatWindowLabel(undefined)).toBe('当前额度')
    expect(formatWindowLabel(0)).toBe('当前额度')
    expect(formatWindowLabel('abc')).toBe('当前额度')
  })

  it('W-TC-10: hasPercentValue 区分「0%」与「没有数据」', () => {
    expect(hasPercentValue(0)).toBe(true)
    expect(hasPercentValue(31)).toBe(true)
    expect(hasPercentValue(null)).toBe(false)
    expect(hasPercentValue(undefined)).toBe(false)
    expect(hasPercentValue(NaN)).toBe(false)
  })
})
