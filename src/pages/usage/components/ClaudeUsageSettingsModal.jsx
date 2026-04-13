/**
 * Claude 会员额度显示设置弹窗 (v1.4.1)
 *
 * 负责：
 * - 以弹窗形式承载原"显示设置卡"的内容（显示模式 radio + 阈值输入）
 * - 独立管理本地 draft 状态，避免直接污染 hook 的 formConfig
 * - 取消/Esc/点遮罩：丢弃修改关闭
 * - 保存：调用 onSave(draft)；失败时保持打开以便重试
 *
 * @module pages/usage/components/ClaudeUsageSettingsModal
 */

import { useEffect, useState } from 'react'
import Modal from '../../../components/Modal/Modal'
import Button from '../../../components/Button/Button'

/**
 * 默认配置（open 时若未提供 initialConfig 的保底）
 */
const FALLBACK_CONFIG = Object.freeze({
  displayMode: 'always',
  fiveHourThreshold: 70,
  sevenDayThreshold: 70,
})

/**
 * 单个 radio 选项
 */
function RadioOption({ checked, onChange, label, desc, value, name }) {
  return (
    <label className={`claude-radio-option${checked ? ' claude-radio-option--checked' : ''}`}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="claude-radio-option__native"
      />
      <span className="claude-radio-option__dot" aria-hidden="true" />
      <span className="claude-radio-option__content">
        <div className="claude-radio-option__label">{label}</div>
        <div className="claude-radio-option__desc">{desc}</div>
      </span>
    </label>
  )
}

/**
 * 规范化阈值输入
 * @param {string|number} value
 * @returns {string}
 */
function normalizeThreshold(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '70'
  return String(Math.max(0, Math.min(100, Math.round(num))))
}

/**
 * 显示设置弹窗
 * @param {object} props
 * @param {boolean} props.open - 是否打开
 * @param {() => void} props.onClose - 关闭回调（取消/Esc/遮罩共用）
 * @param {{displayMode: string, fiveHourThreshold: string|number, sevenDayThreshold: string|number}} props.initialConfig - 初始配置（通常来自 statusState.config）
 * @param {(draft: object) => Promise<boolean>} props.onSave - 保存回调，返回是否成功
 * @param {boolean} [props.saving] - 保存进行中
 * @returns {JSX.Element}
 */
export default function ClaudeUsageSettingsModal({
  open,
  onClose,
  initialConfig,
  onSave,
  saving = false,
}) {
  // 本地 draft：弹窗打开期间用户编辑的内容
  const [draft, setDraft] = useState(() => ({
    displayMode: initialConfig?.displayMode || FALLBACK_CONFIG.displayMode,
    fiveHourThreshold: String(initialConfig?.fiveHourThreshold ?? FALLBACK_CONFIG.fiveHourThreshold),
    sevenDayThreshold: String(initialConfig?.sevenDayThreshold ?? FALLBACK_CONFIG.sevenDayThreshold),
  }))

  // 每次弹窗打开时，用最新的 initialConfig 重置 draft
  // 这样用户取消后再打开，看到的是当前真实配置而非上次编辑遗留
  useEffect(() => {
    if (open) {
      setDraft({
        displayMode: initialConfig?.displayMode || FALLBACK_CONFIG.displayMode,
        fiveHourThreshold: String(initialConfig?.fiveHourThreshold ?? FALLBACK_CONFIG.fiveHourThreshold),
        sevenDayThreshold: String(initialConfig?.sevenDayThreshold ?? FALLBACK_CONFIG.sevenDayThreshold),
      })
    }
  }, [open, initialConfig])

  /**
   * 更新某个字段
   */
  const updateField = (field, value) => {
    setDraft((prev) => ({ ...prev, [field]: value }))
  }

  /**
   * 点击保存
   */
  const handleSave = async () => {
    const normalized = {
      displayMode: draft.displayMode,
      fiveHourThreshold: normalizeThreshold(draft.fiveHourThreshold),
      sevenDayThreshold: normalizeThreshold(draft.sevenDayThreshold),
    }
    const ok = await onSave?.(normalized)
    if (ok) {
      onClose?.()
    }
    // 失败时保持弹窗打开，错误交由 Page 的 Toast 反馈
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="实时额度显示设置"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {saving ? '保存中...' : '保存设置'}
          </Button>
        </>
      }
    >
      <p className="claude-settings-modal-hint">
        控制 Claude Code 底部状态栏的显示行为。修改后点击保存才会生效。
      </p>

      <div className="claude-settings-group">
        <div className="claude-settings-group__label">显示模式</div>

        <RadioOption
          name="claude-display-mode"
          value="always"
          checked={draft.displayMode === 'always'}
          onChange={(v) => updateField('displayMode', v)}
          label="总是显示"
          desc="Claude Code 底部状态栏常驻显示 5h 和 7d 额度"
        />

        <RadioOption
          name="claude-display-mode"
          value="threshold"
          checked={draft.displayMode === 'threshold'}
          onChange={(v) => updateField('displayMode', v)}
          label="达阈值才显示"
          desc="只有 5h 或 7d 任一超过下面的阈值时,才出现在状态栏"
        />

        <RadioOption
          name="claude-display-mode"
          value="off"
          checked={draft.displayMode === 'off'}
          onChange={(v) => updateField('displayMode', v)}
          label="关闭"
          desc="不在 Claude Code 底部显示,但 CodePal 这里仍实时更新数据"
        />
      </div>

      <div className="claude-settings-group">
        <div className="claude-settings-group__label">
          阈值（仅在"达阈值才显示"模式下生效）
        </div>
        <div className="claude-threshold-row">
          <div className="claude-threshold-field">
            <div className="claude-threshold-field__label">5 小时阈值</div>
            <div className="claude-threshold-field__control">
              <input
                className="claude-threshold-field__input"
                type="number"
                min="0"
                max="100"
                value={draft.fiveHourThreshold}
                onChange={(e) => updateField('fiveHourThreshold', e.target.value)}
              />
              <span className="claude-threshold-field__suffix">%</span>
            </div>
          </div>
          <div className="claude-threshold-field">
            <div className="claude-threshold-field__label">7 天阈值</div>
            <div className="claude-threshold-field__control">
              <input
                className="claude-threshold-field__input"
                type="number"
                min="0"
                max="100"
                value={draft.sevenDayThreshold}
                onChange={(e) => updateField('sevenDayThreshold', e.target.value)}
              />
              <span className="claude-threshold-field__suffix">%</span>
            </div>
          </div>
        </div>
        <div className="claude-threshold-help">
          阈值只影响"是否出现在 Claude Code 状态栏"，不影响本页进度条的颜色（颜色固定规则：&lt;60% 绿 · 60-85% 黄 · ≥85% 红）。
        </div>
      </div>
    </Modal>
  )
}
