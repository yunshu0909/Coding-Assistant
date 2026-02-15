/**
 * V0.6 用量页展示与异常测试
 *
 * 负责：
 * - 校验指标卡数值渲染与格式化
 * - 校验正常场景与极端场景下图表/明细一致性
 * - 校验空态兜底与刷新失败保留旧数据
 *
 * @module 自动化测试/V0.6/tests/unit/pages/UsageMonitorPage.v06.display-and-error.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import UsageMonitorPage from '@/pages/UsageMonitorPage.jsx'
import { aggregateUsage } from '@/store/usageAggregator.js'

vi.mock('@/store/usageAggregator.js', () => ({
  aggregateUsage: vi.fn(),
  formatNumber: (num) => String(num),
  formatPercent: (percent) => `${percent}%`
}))

/**
 * 刷新微任务队列
 * @returns {Promise<void>}
 */
async function flushMicrotasks() {
  await act(async () => {
    for (let index = 0; index < 8; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve()
    }
  })
}

/**
 * 构造聚合成功返回
 * @param {object} overrides - 覆盖字段
 * @returns {{success: boolean, data: object}}
 */
function successResult(overrides = {}) {
  return {
    success: true,
    data: {
      period: 'today',
      total: 0,
      input: 0,
      output: 0,
      cache: 0,
      models: [],
      distribution: [],
      isExtremeScenario: false,
      modelCount: 0,
      startTime: '2026-02-15T00:00:00.000Z',
      endTime: '2026-02-15T01:00:00.000Z',
      recordCount: 0,
      ...overrides
    }
  }
}

describe('UsageMonitorPage Display & Error (Unit)', () => {
  beforeEach(() => {
    vi.useRealTimers()
    window.localStorage.clear()
    aggregateUsage.mockReset()

    // 使用 scanLogFiles 作为“可运行环境”标记，避免组件走无 API 降级分支
    window.electronAPI = {
      scanLogFiles: vi.fn()
    }
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('UT-FE-DISPLAY-01: 指标卡应展示正确数值并按规则格式化', async () => {
    aggregateUsage.mockImplementation(async (period) => {
      if (period === 'today') {
        return successResult({
          total: 1500,
          input: 800,
          output: 250,
          cache: 450
        })
      }
      return successResult({ period })
    })

    const { container } = render(<UsageMonitorPage />)
    await flushMicrotasks()

    const values = [...container.querySelectorAll('.metric-card .metric-value')].map((node) => node.textContent.trim())
    expect(values).toEqual(['1.5K', '800', '250', '450'])
  })

  it('UT-FE-DISPLAY-02: 模型数 <= 5 时图例不应出现“其他”', async () => {
    aggregateUsage.mockImplementation(async (period) => {
      if (period === 'today') {
        return successResult({
          period,
          total: 100,
          models: [
            { name: 'codex', total: 50, input: 50, output: 0, cacheRead: 0, cacheCreate: 0, color: '#3b82f6' },
            { name: 'sonnet', total: 30, input: 30, output: 0, cacheRead: 0, cacheCreate: 0, color: '#6366f1' },
            { name: 'kimi', total: 20, input: 20, output: 0, cacheRead: 0, cacheCreate: 0, color: '#16a34a' }
          ],
          distribution: [
            { name: 'codex', percent: 50, color: '#3b82f6', key: 'codex' },
            { name: 'sonnet', percent: 30, color: '#6366f1', key: 'sonnet' },
            { name: 'kimi', percent: 20, color: '#16a34a', key: 'kimi' }
          ],
          modelCount: 3
        })
      }
      return successResult({ period })
    })

    const { container } = render(<UsageMonitorPage />)
    await flushMicrotasks()

    const legendItems = [...container.querySelectorAll('.legend .legend-item')].map((node) => node.textContent.trim())
    expect(legendItems).toHaveLength(3)
    expect(legendItems.some((text) => text.includes('其他'))).toBe(false)
  })

  it('UT-FE-DISPLAY-03: 空窗口应展示空态且页面不崩溃', async () => {
    aggregateUsage.mockImplementation(async (period) => successResult({ period }))

    render(<UsageMonitorPage />)
    await flushMicrotasks()

    expect(screen.getByText('暂无数据')).toBeTruthy()
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
  })

  it('UT-FE-DISPLAY-04: 极端场景应图表 Top5+其他，明细保持全量', async () => {
    aggregateUsage.mockImplementation(async (period) => {
      if (period === 'today') {
        return successResult({
          period,
          total: 2800,
          models: [
            { name: 'model-1', total: 700, input: 700, output: 0, cacheRead: 0, cacheCreate: 0, color: '#111' },
            { name: 'model-2', total: 600, input: 600, output: 0, cacheRead: 0, cacheCreate: 0, color: '#222' },
            { name: 'model-3', total: 500, input: 500, output: 0, cacheRead: 0, cacheCreate: 0, color: '#333' },
            { name: 'model-4', total: 400, input: 400, output: 0, cacheRead: 0, cacheCreate: 0, color: '#444' },
            { name: 'model-5', total: 300, input: 300, output: 0, cacheRead: 0, cacheCreate: 0, color: '#555' },
            { name: 'model-6', total: 200, input: 200, output: 0, cacheRead: 0, cacheCreate: 0, color: '#666' },
            { name: 'model-7', total: 100, input: 100, output: 0, cacheRead: 0, cacheCreate: 0, color: '#777' }
          ],
          distribution: [
            { name: 'model-1', percent: 25, color: '#111', key: 'model-1' },
            { name: 'model-2', percent: 21, color: '#222', key: 'model-2' },
            { name: 'model-3', percent: 18, color: '#333', key: 'model-3' },
            { name: 'model-4', percent: 14, color: '#444', key: 'model-4' },
            { name: 'model-5', percent: 11, color: '#555', key: 'model-5' },
            { name: '其他 (2个模型)', percent: 11, color: '#8b919a', key: 'others' }
          ],
          isExtremeScenario: true,
          modelCount: 7
        })
      }
      return successResult({ period })
    })

    const { container } = render(<UsageMonitorPage />)
    await flushMicrotasks()

    expect(screen.getByText('模型用量明细（7个模型，已展开）')).toBeTruthy()
    expect(container.querySelectorAll('.legend .legend-item')).toHaveLength(6)
    expect(container.querySelectorAll('.data-table tbody tr')).toHaveLength(7)
  })

  it('UT-FE-ERROR-01: 自动刷新失败时应保留旧数据并提示回退信息', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-15T03:00:00.000Z'))

    let failTodayRefresh = false
    aggregateUsage.mockImplementation(async (period) => {
      if (period === 'today' && failTodayRefresh) {
        return { success: false, error: 'SCAN_FAILED' }
      }

      if (period === 'today') {
        return successResult({
          period,
          total: 100,
          models: [{ name: 'codex', total: 100, input: 100, output: 0, cacheRead: 0, cacheCreate: 0, color: '#3b82f6' }],
          distribution: [{ name: 'codex', percent: 100, color: '#3b82f6', key: 'codex' }],
          modelCount: 1,
          recordCount: 1
        })
      }

      return successResult({ period, dailyRefreshKey: '2026-02-15' })
    })

    const { container } = render(<UsageMonitorPage />)
    await flushMicrotasks()

    // 首次成功后应显示初始数据
    expect(container.querySelector('.metric-card .metric-value')?.textContent).toBe('100')

    // 触发 5 分钟自动刷新并制造失败
    failTodayRefresh = true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    })
    await flushMicrotasks()

    expect(screen.getByText(/刷新失败，显示上次数据/)).toBeTruthy()
    // 失败后仍保留旧值
    expect(container.querySelector('.metric-card .metric-value')?.textContent).toBe('100')
  })

  it('UT-FE-ERROR-02: 首次加载失败时应显示错误提示与空态', async () => {
    aggregateUsage.mockResolvedValue({ success: false, error: '聚合失败' })

    render(<UsageMonitorPage />)
    await flushMicrotasks()

    expect(screen.getByText(/聚合失败/)).toBeTruthy()
    expect(screen.getByText('暂无数据')).toBeTruthy()
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
  })
})
