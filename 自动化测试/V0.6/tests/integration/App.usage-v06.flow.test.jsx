/**
 * V0.6 用量监测集成测试
 *
 * 负责：
 * - 校验 App 中导航到用量监测后的主流程展示
 * - 校验页面已接入 V0.6 结构而非占位页面
 *
 * @module 自动化测试/V0.6/tests/integration/App.usage-v06.flow.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App.jsx'
import { dataStore } from '@/store/data.js'
import { aggregateUsage } from '@/store/usageAggregator.js'

vi.mock('@/store/data.js', () => ({
  dataStore: {
    hasCentralSkills: vi.fn(),
    isFirstEntryAfterImport: vi.fn(),
    getLastImportedToolIds: vi.fn(),
    initPushTargetsAfterImport: vi.fn(),
    setFirstEntryAfterImport: vi.fn(),
  },
}))

vi.mock('@/components/SkillManagerModule.jsx', () => ({
  default: () => <div data-testid="skills-module">技能管理模块</div>,
}))

vi.mock('@/pages/ImportPage.jsx', () => ({
  default: () => <div data-testid="import-page">导入页</div>,
}))

vi.mock('@/store/usageAggregator.js', () => ({
  aggregateUsage: vi.fn(),
  formatNumber: (num) => String(num),
  formatPercent: (percent) => `${percent}%`
}))

async function waitUntil(assertion, timeoutMs = 1000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      assertion()
      return
    } catch (_) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
  assertion()
}

describe('App V0.6 Usage Flow (Integration)', () => {
  let container
  let root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    vi.clearAllMocks()
    dataStore.hasCentralSkills.mockResolvedValue(true)
    dataStore.isFirstEntryAfterImport.mockResolvedValue(false)
    dataStore.getLastImportedToolIds.mockReturnValue(['claude-code'])
    dataStore.initPushTargetsAfterImport.mockResolvedValue({ success: true })
    dataStore.setFirstEntryAfterImport.mockResolvedValue({ success: true })

    aggregateUsage.mockReset()
    aggregateUsage.mockImplementation(async (period) => ({
      success: true,
      data: {
        period,
        total: 120,
        input: 60,
        output: 30,
        cache: 30,
        models: [{ name: 'codex', total: 120, input: 60, output: 30, cacheRead: 30, cacheCreate: 0, color: '#3b82f6' }],
        distribution: [{ name: 'codex', percent: 100, color: '#3b82f6', key: 'codex' }],
        isExtremeScenario: false,
        modelCount: 1,
        startTime: '2026-02-15T00:00:00.000Z',
        endTime: '2026-02-15T01:00:00.000Z',
        recordCount: 1
      }
    }))

    // 设置 scanLogFiles 能力，确保页面走真实聚合路径而非“无 API 降级路径”
    window.electronAPI = {
      scanLogFiles: vi.fn()
    }
    window.localStorage.clear()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('IT-01: 切换到用量监测后应看到 V0.6 周期入口', async () => {
    await act(async () => {
      root.render(<App />)
    })

    await waitUntil(() => {
      expect(container.textContent).toContain('技能管理模块')
    })

    const usageButton = [...container.querySelectorAll('.nav-item')].find((button) =>
      button.textContent.includes('用量监测')
    )

    await act(async () => {
      usageButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitUntil(() => {
      expect(container.textContent).toContain('今日')
      expect(container.textContent).toContain('近7天')
      expect(container.textContent).toContain('近30天')
    })
  })

  it('IT-02: 用量监测模块应展示明细表而不是占位卡片', async () => {
    await act(async () => {
      root.render(<App />)
    })

    const usageButton = [...container.querySelectorAll('.nav-item')].find((button) =>
      button.textContent.includes('用量监测')
    )

    await act(async () => {
      usageButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitUntil(() => {
      expect(container.textContent).toContain('模型用量明细')
    })
    expect(container.textContent).not.toContain('当前版本为模块占位')
  })

  it('IT-03: 周期切换应仅切展示，不触发重算', async () => {
    await act(async () => {
      root.render(<App />)
    })

    const usageButton = [...container.querySelectorAll('.nav-item')].find((button) =>
      button.textContent.includes('用量监测')
    )

    await act(async () => {
      usageButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitUntil(() => {
      expect(container.textContent).toContain('模型占比')
    })

    await waitUntil(() => {
      expect(aggregateUsage).toHaveBeenCalledTimes(3)
    })

    aggregateUsage.mockClear()

    const segmentButtons = [...container.querySelectorAll('.segment-item')]
    const weekButton = segmentButtons.find((button) => button.textContent.includes('近7天'))
    const monthButton = segmentButtons.find((button) => button.textContent.includes('近30天'))
    const todayButton = segmentButtons.find((button) => button.textContent.includes('今日'))

    await act(async () => {
      weekButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      monthButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      todayButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // 切换周期只应切展示，不触发新一轮聚合
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(aggregateUsage).toHaveBeenCalledTimes(0)
  })
})
