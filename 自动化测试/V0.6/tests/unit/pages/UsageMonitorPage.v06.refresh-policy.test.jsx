/**
 * V0.6 用量页刷新策略测试
 *
 * 负责：
 * - 校验首次进入会预热 today/week/month 三周期缓存
 * - 校验周期切换仅切展示，不触发重算
 * - 校验今日 5 分钟刷新与 7天/30天 00:05 刷新策略
 *
 * @module 自动化测试/V0.6/tests/unit/pages/UsageMonitorPage.v06.refresh-policy.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import UsageMonitorPage from '@/pages/UsageMonitorPage.jsx'
import { aggregateUsage } from '@/store/usageAggregator.js'

vi.mock('@/store/usageAggregator.js', () => ({
  aggregateUsage: vi.fn(),
  formatNumber: (num) => String(num),
  formatPercent: (percent) => `${percent}%`
}))

/**
 * 生成聚合返回数据
 * @param {'today'|'week'|'month'} period - 周期
 * @returns {{success: boolean, data: object}}
 */
function createAggregateResult(period) {
  return {
    success: true,
    data: {
      period,
      total: 100,
      input: 60,
      output: 20,
      cache: 20,
      models: [],
      distribution: [],
      isExtremeScenario: false,
      modelCount: 0,
      startTime: '2026-02-15T00:00:00.000Z',
      endTime: '2026-02-15T01:00:00.000Z',
      recordCount: 1
    }
  }
}

/**
 * 刷新微任务队列
 * 说明：组件内聚合逻辑通过 Promise 链触发，使用该方法确保异步状态已落地
 * @returns {Promise<void>}
 */
async function flushMicrotasks() {
  await act(async () => {
    for (let index = 0; index < 6; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve()
    }
  })
}

describe('UsageMonitorPage Refresh Policy (Unit)', () => {
  beforeEach(() => {
    vi.useRealTimers()
    window.localStorage.clear()

    aggregateUsage.mockReset()
    aggregateUsage.mockImplementation(async (period) => createAggregateResult(period))

    window.electronAPI = {
      scanLogFiles: vi.fn()
    }
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('UT-FE-01: 首次进入应预热三个周期缓存', async () => {
    render(<UsageMonitorPage />)
    await flushMicrotasks()

    expect(aggregateUsage).toHaveBeenCalledTimes(3)

    const calledPeriods = aggregateUsage.mock.calls.map((args) => args[0]).sort()
    expect(calledPeriods).toEqual(['month', 'today', 'week'])
  })

  it('UT-FE-02: 周期切换只切展示，不应触发重算', async () => {
    render(<UsageMonitorPage />)
    await flushMicrotasks()

    expect(aggregateUsage).toHaveBeenCalledTimes(3)

    aggregateUsage.mockClear()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '近7天' }))
      fireEvent.click(screen.getByRole('button', { name: '近30天' }))
      fireEvent.click(screen.getByRole('button', { name: '今日' }))
    })

    await flushMicrotasks()
    expect(aggregateUsage).toHaveBeenCalledTimes(0)
  })

  it('UT-FE-03: 今日数据应每 5 分钟触发一次重算', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-15T03:00:00.000Z')) // 北京时间 11:00
    render(<UsageMonitorPage />)
    await flushMicrotasks()

    expect(aggregateUsage).toHaveBeenCalledTimes(3)

    aggregateUsage.mockClear()

    // 4 分钟内不应触发今日重算
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * 60 * 1000)
    })
    await flushMicrotasks()
    expect(aggregateUsage).toHaveBeenCalledTimes(0)

    // 到第 5 分钟后应触发 today 重算
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 1000)
    })
    await flushMicrotasks()
    expect(aggregateUsage).toHaveBeenCalledTimes(1)
    expect(aggregateUsage).toHaveBeenCalledWith('today')
  })

  it('UT-FE-04: 7天/30天应在北京时间 00:05 切换批次后重算', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-14T16:04:00.000Z')) // 北京时间 00:04
    render(<UsageMonitorPage />)
    await flushMicrotasks()

    expect(aggregateUsage).toHaveBeenCalledTimes(3)

    aggregateUsage.mockClear()

    // 从 00:04 到 00:05，触发一轮定时检查
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 1000)
    })
    await flushMicrotasks()
    expect(aggregateUsage).toHaveBeenCalledTimes(2)

    const calledPeriods = aggregateUsage.mock.calls.map((args) => args[0]).sort()
    expect(calledPeriods).toEqual(['month', 'week'])
  })
})
