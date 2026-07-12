/**
 * V1.9.10 会员额度显示设置弹窗样式所有权回归测试
 *
 * @module 自动化测试/V1.9.10/tests/usageSettingsModalStyle.test
 */

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ClaudeUsageSettingsModal from '../../../src/pages/usage/components/ClaudeUsageSettingsModal'

describe('V1.9.10 显示设置弹窗样式所有权', () => {
  it('HOTFIX-TC-01: 弹窗直接导入自己的 CSS，不再依赖旧卡片渲染', () => {
    const componentPath = path.join(process.cwd(), 'src/pages/usage/components/ClaudeUsageSettingsModal.jsx')
    const modalCssPath = path.join(process.cwd(), 'src/pages/usage/components/ClaudeUsageSettingsModal.css')
    const legacyCssPath = path.join(process.cwd(), 'src/pages/usage/components/ClaudeUsageStatusCard.css')
    const componentSource = fs.readFileSync(componentPath, 'utf8')
    const modalCss = fs.readFileSync(modalCssPath, 'utf8')
    const legacyCss = fs.readFileSync(legacyCssPath, 'utf8')

    expect(componentSource).toContain("import './ClaudeUsageSettingsModal.css'")
    expect(modalCss).toContain('.claude-radio-option--checked')
    expect(modalCss).toContain('.claude-threshold-field__control')
    expect(modalCss).toContain('border: 1.5px solid var(--border-default)')
    expect(legacyCss).not.toContain('.claude-radio-option')
    expect(legacyCss).not.toContain('.claude-threshold-field')
  })

  it('HOTFIX-TC-02: 弹窗仍渲染可交互的选中态与阈值字段', () => {
    render(
      <ClaudeUsageSettingsModal
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        initialConfig={{ displayMode: 'always', fiveHourThreshold: 70, sevenDayThreshold: 70 }}
      />
    )

    const alwaysLabel = screen.getByText('总是显示').closest('label')
    const thresholdLabel = screen.getByText('达阈值才显示').closest('label')
    expect(alwaysLabel).toHaveClass('claude-radio-option--checked')
    expect(screen.getAllByDisplayValue('70')).toHaveLength(2)

    fireEvent.click(thresholdLabel)
    expect(thresholdLabel).toHaveClass('claude-radio-option--checked')
    expect(alwaysLabel).not.toHaveClass('claude-radio-option--checked')
  })
})
