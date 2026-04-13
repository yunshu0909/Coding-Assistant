/**
 * V1.4.1 ClaudeUsageStatusPage 集成测试
 *
 * 负责：
 * - 验证齿轮按钮在不同 integrationState 下的启用/禁用规则
 * - 验证 ClaudeUsageTrendCard 的条件渲染（仅在 ready + hasRateLimits 时出现）
 * - 验证显示设置弹窗的开/关流程
 * - 验证保存成功/失败对应的 Toast 反馈
 * - 验证快照过期时 stale 状态会透传到趋势卡片
 *
 * 测试策略：
 * - 直接 mock useClaudeUsageStatus，通过模块级 setter 动态控制 statusState
 * - 子组件（Card/TrendCard/Modal）使用真实实现，保持集成测试的覆盖面
 * - 通过 DOM 断言 trend-card / trend-card--stale / 按钮 disabled 等行为
 *
 * @module 自动化测试/V1.4.1/ClaudeUsageStatusPage.integration.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'

// mock 必须在 import Page 之前；vi.mock 会被 hoist，所以这里用 setter 让测试在运行时
// 覆盖返回值，避免每个用例单独写一个 vi.mock（ESM 下重复 mock 不方便）
let currentHookReturn

vi.mock('@/pages/usage/useClaudeUsageStatus', () => ({
  default: () => currentHookReturn,
}))

// Page 内部是相对路径 `./usage/useClaudeUsageStatus`，Vite 解析后会落到同一个模块 id，
// 所以上面的 @ 别名 mock 即可拦截 Page 的 import。

import ClaudeUsageStatusPage from '@/pages/ClaudeUsageStatusPage.jsx'

/**
 * 生成默认快照（ready + hasRateLimits=true，updatedAt 为刚刚）
 */
function makeSnapshot(overrides = {}) {
  const nowSec = Math.floor(Date.now() / 1000)
  return {
    hasRateLimits: true,
    fiveHourUsedPercentage: 42,
    sevenDayUsedPercentage: 31,
    resetsAt: nowSec + 3 * 3600,
    sevenDayResetsAt: nowSec + 5 * 86400,
    updatedAt: nowSec,
    modelDisplayName: 'Opus 4.6 (1M context)',
    ...overrides,
  }
}

/**
 * 生成 statusState（ready 态）
 */
function makeReadyState(snapshotOverrides = {}, configOverrides = {}) {
  return {
    integrationState: 'ready',
    snapshot: makeSnapshot(snapshotOverrides),
    config: {
      displayMode: 'always',
      fiveHourThreshold: 70,
      sevenDayThreshold: 70,
      ...configOverrides,
    },
  }
}

/**
 * 设置 hook 返回值。每个用例根据需要覆盖
 */
function setHookReturn({
  statusState,
  saving = false,
  saveConfig,
  loading = false,
  installing = false,
  error = null,
  history = { currentCycle: null, completedCycles: [] },
} = {}) {
  currentHookReturn = {
    statusState,
    loading,
    installing,
    saving,
    error,
    history,
    loadStatus: vi.fn(),
    loadHistory: vi.fn(),
    ensureInstalled: vi.fn(),
    saveConfig: saveConfig || vi.fn().mockResolvedValue(true),
  }
  return currentHookReturn
}

beforeEach(() => {
  // Modal 子组件依赖 document.body / key listener，这里只确保干净状态
  document.body.innerHTML = ''
  // 有些子组件（Card 的 ensureInstalled 按钮）可能访问 electronAPI，这里给个空实现
  window.electronAPI = {}
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  currentHookReturn = undefined
})

/**
 * 查询齿轮按钮（标题区的"显示设置"）
 */
function getGearButton() {
  return screen.getByRole('button', { name: /显示设置/ })
}

// ============================================================
// A. 齿轮按钮启用/禁用规则
// ============================================================
describe('V1.4.1 ClaudeUsageStatusPage - 齿轮按钮 disabled 规则', () => {
  const cases = [
    { state: 'ready', expectedDisabled: false },
    { state: 'waiting_for_data', expectedDisabled: false },
    { state: 'not_installed', expectedDisabled: true },
    { state: 'not_configured', expectedDisabled: true },
    { state: 'conflict', expectedDisabled: true },
    { state: 'setup_failed', expectedDisabled: true },
  ]

  cases.forEach(({ state, expectedDisabled }) => {
    it(`integrationState=${state} → disabled=${expectedDisabled}`, () => {
      setHookReturn({
        statusState: {
          integrationState: state,
          // ready/waiting 下给个最小 snapshot 即可（不影响 disabled 判断）
          snapshot: state === 'ready' ? makeSnapshot() : null,
          config: {
            displayMode: 'always',
            fiveHourThreshold: 70,
            sevenDayThreshold: 70,
          },
        },
      })

      render(<ClaudeUsageStatusPage />)
      const btn = getGearButton()
      expect(btn.disabled).toBe(expectedDisabled)
    })
  })

  it('statusState=null → disabled=true', () => {
    setHookReturn({ statusState: null })
    render(<ClaudeUsageStatusPage />)
    expect(getGearButton().disabled).toBe(true)
  })
})

// ============================================================
// B. 满载率趋势卡可见性
// ============================================================
describe('V1.4.1 ClaudeUsageStatusPage - 趋势卡可见性', () => {
  /**
   * 判断趋势卡是否出现：通过 .trend-card 选择器（最稳），
   * 同时用"满载率趋势"文本做双重断言
   */
  function trendCardVisible() {
    const el = document.querySelector('.trend-card')
    return el !== null
  }

  it('ready + hasRateLimits=true → 渲染趋势卡', () => {
    setHookReturn({
      statusState: makeReadyState({ hasRateLimits: true }),
    })
    render(<ClaudeUsageStatusPage />)
    expect(trendCardVisible()).toBe(true)
    expect(screen.getByText('满载率趋势')).toBeTruthy()
  })

  it('ready + hasRateLimits=false → 不渲染趋势卡', () => {
    setHookReturn({
      statusState: makeReadyState({ hasRateLimits: false }),
    })
    render(<ClaudeUsageStatusPage />)
    expect(trendCardVisible()).toBe(false)
  })

  it('ready + snapshot 缺少 hasRateLimits 字段 → 不渲染趋势卡', () => {
    const s = makeReadyState()
    delete s.snapshot.hasRateLimits
    setHookReturn({ statusState: s })
    render(<ClaudeUsageStatusPage />)
    expect(trendCardVisible()).toBe(false)
  })

  const negativeCases = [
    'waiting_for_data',
    'not_installed',
    'conflict',
    'setup_failed',
  ]

  negativeCases.forEach((state) => {
    it(`integrationState=${state} → 不渲染趋势卡`, () => {
      setHookReturn({
        statusState: {
          integrationState: state,
          snapshot: null,
          config: {
            displayMode: 'always',
            fiveHourThreshold: 70,
            sevenDayThreshold: 70,
          },
        },
      })
      render(<ClaudeUsageStatusPage />)
      expect(trendCardVisible()).toBe(false)
    })
  })

  it('no_rate_limits 场景（waiting_for_data + snapshot.updatedAt 存在）→ 不渲染趋势卡', () => {
    setHookReturn({
      statusState: {
        integrationState: 'waiting_for_data',
        snapshot: makeSnapshot({ hasRateLimits: false }),
        config: {
          displayMode: 'always',
          fiveHourThreshold: 70,
          sevenDayThreshold: 70,
        },
      },
    })
    render(<ClaudeUsageStatusPage />)
    expect(trendCardVisible()).toBe(false)
  })

  it('read_error 场景（statusState=null + error 非空）→ 不渲染趋势卡', () => {
    setHookReturn({ statusState: null, error: 'IPC 读取失败' })
    render(<ClaudeUsageStatusPage />)
    expect(trendCardVisible()).toBe(false)
  })

  it('statusState=null → 不渲染趋势卡', () => {
    setHookReturn({ statusState: null })
    render(<ClaudeUsageStatusPage />)
    expect(trendCardVisible()).toBe(false)
  })
})

// ============================================================
// C. 显示设置弹窗开/关
// ============================================================
describe('V1.4.1 ClaudeUsageStatusPage - 设置弹窗开关', () => {
  it('初次渲染时弹窗不可见', () => {
    setHookReturn({ statusState: makeReadyState() })
    render(<ClaudeUsageStatusPage />)
    // Modal open=false 时整个 dialog 不渲染
    expect(document.querySelector('.modal-overlay')).toBeNull()
  })

  it('点击启用态的齿轮按钮 → 弹窗出现', () => {
    setHookReturn({ statusState: makeReadyState() })
    render(<ClaudeUsageStatusPage />)

    fireEvent.click(getGearButton())

    expect(document.querySelector('.modal-overlay')).not.toBeNull()
    // 弹窗的标题存在
    expect(screen.getByText('实时额度显示设置')).toBeTruthy()
  })

  it('弹窗内点击"取消"关闭弹窗', () => {
    setHookReturn({ statusState: makeReadyState() })
    render(<ClaudeUsageStatusPage />)

    fireEvent.click(getGearButton())
    expect(document.querySelector('.modal-overlay')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(document.querySelector('.modal-overlay')).toBeNull()
  })
})

// ============================================================
// D. 保存 → Toast 反馈
// ============================================================
describe('V1.4.1 ClaudeUsageStatusPage - 保存 Toast', () => {
  it('saveConfig 返回 true → 成功 Toast', async () => {
    const saveConfig = vi.fn().mockResolvedValue(true)
    setHookReturn({ statusState: makeReadyState(), saveConfig })

    render(<ClaudeUsageStatusPage />)
    fireEvent.click(getGearButton())

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
    })

    await waitFor(() => {
      expect(saveConfig).toHaveBeenCalled()
    })

    // Toast 文案 + 成功样式
    await waitFor(() => {
      expect(screen.getByText('显示设置已保存')).toBeTruthy()
    })
    const toast = document.querySelector('.toast')
    expect(toast).not.toBeNull()
    expect(toast.className).toContain('toast--success')
  })

  it('saveConfig 返回 false → 失败 Toast', async () => {
    const saveConfig = vi.fn().mockResolvedValue(false)
    setHookReturn({ statusState: makeReadyState(), saveConfig })

    render(<ClaudeUsageStatusPage />)
    fireEvent.click(getGearButton())

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
    })

    await waitFor(() => {
      expect(saveConfig).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.getByText('保存失败，请重试')).toBeTruthy()
    })
    const toast = document.querySelector('.toast')
    expect(toast).not.toBeNull()
    expect(toast.className).toContain('toast--error')
  })
})

// ============================================================
// E. stale 透传
// ============================================================
describe('V1.4.1 ClaudeUsageStatusPage - stale 透传到趋势卡', () => {
  it('updatedAt 在 3 小时前 + ready + hasRateLimits=true → trend-card 带 --stale 类', () => {
    const threeHoursAgoSec = Math.floor(Date.now() / 1000) - 3 * 3600
    setHookReturn({
      statusState: makeReadyState({
        hasRateLimits: true,
        updatedAt: threeHoursAgoSec,
      }),
    })

    render(<ClaudeUsageStatusPage />)

    const trendCard = document.querySelector('.trend-card')
    expect(trendCard).not.toBeNull()
    expect(trendCard.classList.contains('trend-card--stale')).toBe(true)
  })

  it('updatedAt 为刚刚（未 stale）→ trend-card 不带 --stale 类', () => {
    setHookReturn({
      statusState: makeReadyState({
        hasRateLimits: true,
        updatedAt: Math.floor(Date.now() / 1000),
      }),
    })

    render(<ClaudeUsageStatusPage />)

    const trendCard = document.querySelector('.trend-card')
    expect(trendCard).not.toBeNull()
    expect(trendCard.classList.contains('trend-card--stale')).toBe(false)
  })
})
