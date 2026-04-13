/**
 * V1.4.1 useClaudeUsageStatus Hook 单元测试
 *
 * 负责：
 * - 验证初次加载的 loading / statusState / history 流转
 * - 验证 loadHistory 对 success/非 success 的分支处理
 * - 验证 saveConfig(override) 的 v1.4.1 新行为：IPC 使用 override 参数
 * - 验证 saveConfig() 不带 override 时回退到内部 formConfig
 * - 验证 IPC 抛异常时的错误态处理
 *
 * @module 自动化测试/V1.4.1/useClaudeUsageStatus.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import useClaudeUsageStatus from '@/pages/usage/useClaudeUsageStatus.js'

/**
 * 构造一个可用的默认 statusState 响应
 * @returns {object}
 */
function makeStatusResponse(overrides = {}) {
  return {
    success: true,
    claudeInstalled: true,
    integrationState: 'ready',
    config: {
      displayMode: 'always',
      fiveHourThreshold: 70,
      sevenDayThreshold: 70,
    },
    snapshot: {
      hasRateLimits: true,
      fiveHourUsedPercentage: 10,
      sevenDayUsedPercentage: 20,
    },
    ...overrides,
  }
}

describe('useClaudeUsageStatus (V1.4.1)', () => {
  beforeEach(() => {
    global.window = global.window || {}
    window.electronAPI = {
      getClaudeUsageStatusState: vi.fn().mockResolvedValue(makeStatusResponse()),
      getClaudeUsageHistory: vi.fn().mockResolvedValue({
        success: true,
        currentCycle: null,
        completedCycles: [],
      }),
      saveClaudeUsageStatusConfig: vi.fn().mockResolvedValue(makeStatusResponse()),
      ensureClaudeUsageStatusInstalled: vi.fn().mockResolvedValue(makeStatusResponse()),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ============================================================
  // A. Initial state
  // ============================================================
  describe('A. 初始加载', () => {
    it('mount 后 loading 由 true 变 false，statusState 被填充', async () => {
      const { result } = renderHook(() => useClaudeUsageStatus())

      // 初始 loading 为 true
      expect(result.current.loading).toBe(true)
      expect(result.current.statusState).toBeNull()

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.statusState).not.toBeNull()
      expect(result.current.statusState.integrationState).toBe('ready')
      expect(window.electronAPI.getClaudeUsageStatusState).toHaveBeenCalledTimes(1)
      expect(window.electronAPI.getClaudeUsageHistory).toHaveBeenCalledTimes(1)
    })

    it('history 初始为空，加载成功后被填充', async () => {
      const currentCycle = { cycleId: 'c1', maxUsagePercent: 42 }
      const completedCycles = [{ cycleId: 'prev-1', maxUsagePercent: 88 }]

      window.electronAPI.getClaudeUsageHistory.mockResolvedValueOnce({
        success: true,
        currentCycle,
        completedCycles,
      })

      const { result } = renderHook(() => useClaudeUsageStatus())

      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(result.current.history.currentCycle).toEqual(currentCycle)
      expect(result.current.history.completedCycles).toEqual(completedCycles)
    })
  })

  // ============================================================
  // B. loadHistory
  // ============================================================
  describe('B. loadHistory', () => {
    it('success=false 时保持默认 history 结构', async () => {
      // 第一次返回 success=false
      window.electronAPI.getClaudeUsageHistory.mockResolvedValue({
        success: false,
        error: 'read failed',
      })

      const { result } = renderHook(() => useClaudeUsageStatus())
      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(result.current.history).toEqual({ currentCycle: null, completedCycles: [] })
    })

    it('主动调用 loadHistory 能更新 state', async () => {
      const { result } = renderHook(() => useClaudeUsageStatus())
      await waitFor(() => expect(result.current.loading).toBe(false))

      // 更改 mock，准备下一次调用返回新数据
      const newCycle = { cycleId: 'c2', maxUsagePercent: 99 }
      window.electronAPI.getClaudeUsageHistory.mockResolvedValueOnce({
        success: true,
        currentCycle: newCycle,
        completedCycles: [{ cycleId: 'done', maxUsagePercent: 50 }],
      })

      await act(async () => {
        await result.current.loadHistory()
      })

      expect(result.current.history.currentCycle).toEqual(newCycle)
      expect(result.current.history.completedCycles.length).toBe(1)
    })
  })

  // ============================================================
  // C. saveConfig with override (v1.4.1)
  // ============================================================
  describe('C. saveConfig 携带 override（v1.4.1 新行为）', () => {
    it('使用 override 的值调用 IPC，而不是内部 formConfig', async () => {
      const { result } = renderHook(() => useClaudeUsageStatus())
      await waitFor(() => expect(result.current.loading).toBe(false))

      // formConfig 内部此时应为 default 加载后的值（display=always, 70/70）
      // 我们用一组完全不同的 override 值
      const override = {
        displayMode: 'off',
        fiveHourThreshold: 50,
        sevenDayThreshold: 60,
      }

      let returnValue
      await act(async () => {
        returnValue = await result.current.saveConfig(override)
      })

      expect(returnValue).toBe(true)
      expect(window.electronAPI.saveClaudeUsageStatusConfig).toHaveBeenCalledTimes(1)
      const payload = window.electronAPI.saveClaudeUsageStatusConfig.mock.calls[0][0]
      expect(payload).toEqual({
        displayMode: 'off',
        fiveHourThreshold: 50,
        sevenDayThreshold: 60,
      })
    })
  })

  // ============================================================
  // D. saveConfig 不带 override（向后兼容）
  // ============================================================
  describe('D. saveConfig 无 override 回退到 formConfig', () => {
    it('使用 formConfig 的当前值调用 IPC', async () => {
      const { result } = renderHook(() => useClaudeUsageStatus())
      await waitFor(() => expect(result.current.loading).toBe(false))

      // 通过 updateFormConfig 改写内部 formConfig
      act(() => {
        result.current.updateFormConfig('displayMode', 'threshold')
        result.current.updateFormConfig('fiveHourThreshold', '45')
        result.current.updateFormConfig('sevenDayThreshold', '55')
      })

      await act(async () => {
        await result.current.saveConfig()
      })

      expect(window.electronAPI.saveClaudeUsageStatusConfig).toHaveBeenCalledTimes(1)
      const payload = window.electronAPI.saveClaudeUsageStatusConfig.mock.calls[0][0]
      expect(payload.displayMode).toBe('threshold')
      // 阈值会被 Number() 转换
      expect(payload.fiveHourThreshold).toBe(45)
      expect(payload.sevenDayThreshold).toBe(55)
    })
  })

  // ============================================================
  // E. 错误处理
  // ============================================================
  describe('E. 错误处理', () => {
    it('getClaudeUsageStatusState 抛异常 → loading=false, statusState=null, error 被设置', async () => {
      window.electronAPI.getClaudeUsageStatusState.mockRejectedValueOnce(
        new Error('boom')
      )

      const { result } = renderHook(() => useClaudeUsageStatus())

      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(result.current.statusState).toBeNull()
      expect(result.current.error).toBe('boom')
    })
  })
})
