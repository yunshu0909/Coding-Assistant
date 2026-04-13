/**
 * V1.4.1 ClaudeUsageSettingsModal 单元测试
 *
 * 负责：
 * - 验证弹窗在 open=false/true 的渲染行为
 * - 验证 initialConfig 的回填与缺省兜底
 * - 验证本地 draft 与外部 formConfig 的隔离（Cancel 不触发 onSave）
 * - 验证重新打开时 draft 会根据新的 initialConfig 重置
 * - 验证保存：成功关闭、失败保持打开、阈值规范化
 * - 验证 saving 状态下按钮文案
 *
 * @module 自动化测试/V1.4.1/ClaudeUsageSettingsModal.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import ClaudeUsageSettingsModal from '@/pages/usage/components/ClaudeUsageSettingsModal.jsx'

describe('ClaudeUsageSettingsModal (V1.4.1)', () => {
  afterEach(() => {
    cleanup()
    document.body.innerHTML = ''
  })

  // ============================================================
  // A. Rendering
  // ============================================================
  describe('A. 渲染', () => {
    it('open=false 时不渲染弹窗内容', () => {
      const { container } = render(
        <ClaudeUsageSettingsModal
          open={false}
          onClose={() => {}}
          onSave={() => true}
          initialConfig={{ displayMode: 'always', fiveHourThreshold: 70, sevenDayThreshold: 70 }}
        />
      )
      expect(container.querySelector('.modal-overlay')).toBeNull()
      expect(screen.queryByText('实时额度显示设置')).toBeNull()
    })

    it('open=true 时渲染标题、3 个 radio、2 个阈值输入、取消/保存按钮', () => {
      render(
        <ClaudeUsageSettingsModal
          open={true}
          onClose={() => {}}
          onSave={() => true}
          initialConfig={{ displayMode: 'always', fiveHourThreshold: 70, sevenDayThreshold: 70 }}
        />
      )

      // 标题
      expect(screen.getByText('实时额度显示设置')).toBeTruthy()

      // 3 个 radio 标签文案
      expect(screen.getByText('总是显示')).toBeTruthy()
      expect(screen.getByText('达阈值才显示')).toBeTruthy()
      expect(screen.getByText('关闭')).toBeTruthy()

      // 3 个 radio input
      const radios = document.querySelectorAll('input[type="radio"][name="claude-display-mode"]')
      expect(radios.length).toBe(3)

      // 阈值标签
      expect(screen.getByText('5 小时阈值')).toBeTruthy()
      expect(screen.getByText('7 天阈值')).toBeTruthy()

      // 2 个数字输入
      const numberInputs = document.querySelectorAll('input[type="number"]')
      expect(numberInputs.length).toBe(2)

      // 底部按钮
      expect(screen.getByRole('button', { name: '取消' })).toBeTruthy()
      expect(screen.getByRole('button', { name: '保存设置' })).toBeTruthy()
    })
  })

  // ============================================================
  // B. Initial state from initialConfig
  // ============================================================
  describe('B. 初始状态回填', () => {
    it('initialConfig 提供 threshold 模式时应回填 radio 与阈值输入', () => {
      render(
        <ClaudeUsageSettingsModal
          open={true}
          onClose={() => {}}
          onSave={() => true}
          initialConfig={{ displayMode: 'threshold', fiveHourThreshold: 60, sevenDayThreshold: 80 }}
        />
      )

      const radioThreshold = document.querySelector('input[type="radio"][value="threshold"]')
      const radioAlways = document.querySelector('input[type="radio"][value="always"]')
      const radioOff = document.querySelector('input[type="radio"][value="off"]')
      expect(radioThreshold.checked).toBe(true)
      expect(radioAlways.checked).toBe(false)
      expect(radioOff.checked).toBe(false)

      const numberInputs = document.querySelectorAll('input[type="number"]')
      expect(numberInputs[0].value).toBe('60')
      expect(numberInputs[1].value).toBe('80')
    })

    it('initialConfig 缺省时应回退到默认（always / 70 / 70）', () => {
      render(
        <ClaudeUsageSettingsModal
          open={true}
          onClose={() => {}}
          onSave={() => true}
        />
      )

      const radioAlways = document.querySelector('input[type="radio"][value="always"]')
      expect(radioAlways.checked).toBe(true)

      const numberInputs = document.querySelectorAll('input[type="number"]')
      expect(numberInputs[0].value).toBe('70')
      expect(numberInputs[1].value).toBe('70')
    })
  })

  // ============================================================
  // C. Local draft state isolation (Cancel 不触发 onSave)
  // ============================================================
  describe('C. 本地 draft 与外部隔离', () => {
    it('修改 radio 后点击取消：触发 onClose，不触发 onSave', () => {
      const onClose = vi.fn()
      const onSave = vi.fn()

      render(
        <ClaudeUsageSettingsModal
          open={true}
          onClose={onClose}
          onSave={onSave}
          initialConfig={{ displayMode: 'always', fiveHourThreshold: 70, sevenDayThreshold: 70 }}
        />
      )

      // 用户切到 threshold
      const radioThreshold = document.querySelector('input[type="radio"][value="threshold"]')
      fireEvent.click(radioThreshold)
      expect(radioThreshold.checked).toBe(true)

      // 点击取消
      fireEvent.click(screen.getByRole('button', { name: '取消' }))
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(onSave).not.toHaveBeenCalled()
    })
  })

  // ============================================================
  // D. Reset on re-open
  // ============================================================
  describe('D. 重新打开时 draft 重置', () => {
    it('关闭后再次以原 initialConfig 打开：radio 状态回到 initialConfig 所示', () => {
      const initialA = { displayMode: 'always', fiveHourThreshold: 70, sevenDayThreshold: 70 }

      const { rerender } = render(
        <ClaudeUsageSettingsModal
          open={true}
          onClose={() => {}}
          onSave={() => true}
          initialConfig={initialA}
        />
      )

      // 用户切到 threshold（draft 变为 B）
      const radioThreshold = document.querySelector('input[type="radio"][value="threshold"]')
      fireEvent.click(radioThreshold)
      expect(radioThreshold.checked).toBe(true)

      // 关闭（外部传入 open=false）
      rerender(
        <ClaudeUsageSettingsModal
          open={false}
          onClose={() => {}}
          onSave={() => true}
          initialConfig={initialA}
        />
      )

      // 再以同一个 initialConfig 打开
      rerender(
        <ClaudeUsageSettingsModal
          open={true}
          onClose={() => {}}
          onSave={() => true}
          initialConfig={initialA}
        />
      )

      // draft 应重置为 initialA，即 always 选中
      const radioAlways = document.querySelector('input[type="radio"][value="always"]')
      const radioThresholdAfter = document.querySelector('input[type="radio"][value="threshold"]')
      expect(radioAlways.checked).toBe(true)
      expect(radioThresholdAfter.checked).toBe(false)
    })
  })

  // ============================================================
  // E. Save behavior
  // ============================================================
  describe('E. 保存行为', () => {
    it('点击保存 → onSave 收到规范化的 draft（阈值是字符串）', async () => {
      const onSave = vi.fn().mockResolvedValue(true)
      const onClose = vi.fn()

      render(
        <ClaudeUsageSettingsModal
          open={true}
          onClose={onClose}
          onSave={onSave}
          initialConfig={{ displayMode: 'threshold', fiveHourThreshold: 60, sevenDayThreshold: 80 }}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
      const payload = onSave.mock.calls[0][0]
      expect(payload.displayMode).toBe('threshold')
      // 阈值规范化：字符串
      expect(payload.fiveHourThreshold).toBe('60')
      expect(payload.sevenDayThreshold).toBe('80')
      // 类型校验
      expect(typeof payload.fiveHourThreshold).toBe('string')
      expect(typeof payload.sevenDayThreshold).toBe('string')
    })

    it('onSave 返回 true → 触发 onClose', async () => {
      const onSave = vi.fn().mockResolvedValue(true)
      const onClose = vi.fn()

      render(
        <ClaudeUsageSettingsModal
          open={true}
          onClose={onClose}
          onSave={onSave}
          initialConfig={{ displayMode: 'always', fiveHourThreshold: 70, sevenDayThreshold: 70 }}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    })

    it('onSave 返回 false → 不触发 onClose（保持打开以便重试）', async () => {
      const onSave = vi.fn().mockResolvedValue(false)
      const onClose = vi.fn()

      render(
        <ClaudeUsageSettingsModal
          open={true}
          onClose={onClose}
          onSave={onSave}
          initialConfig={{ displayMode: 'always', fiveHourThreshold: 70, sevenDayThreshold: 70 }}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
      // 给 microtask 机会执行完
      await Promise.resolve()
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  // ============================================================
  // F. Saving prop
  // ============================================================
  describe('F. 保存中状态', () => {
    it('saving=true → 保存按钮文案变为"保存中..."', () => {
      render(
        <ClaudeUsageSettingsModal
          open={true}
          onClose={() => {}}
          onSave={() => true}
          initialConfig={{ displayMode: 'always', fiveHourThreshold: 70, sevenDayThreshold: 70 }}
          saving={true}
        />
      )

      expect(screen.getByRole('button', { name: /保存中/ })).toBeTruthy()
      expect(screen.queryByRole('button', { name: '保存设置' })).toBeNull()
    })
  })
})
