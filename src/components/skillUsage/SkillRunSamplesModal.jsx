/**
 * SkillRunSamplesModal — 展示单个 skill 的清洗后运行样本
 *
 * 负责：
 * - 按需调用 `listSkillRunSamples`
 * - 展示 usable run sample 列表
 * - 说明 raw/logical/usable 三层口径
 *
 * @module components/skillUsage/SkillRunSamplesModal
 */
import React, { useEffect, useState } from 'react'
import Modal from '../Modal/Modal'
import Button from '../Button/Button'
import Tag from '../Tag/Tag'
import './skillUsage.css'

function formatTime(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return value
  }
}

function labelForTrigger(triggerType) {
  const labels = {
    claude_tool_use: 'Claude Tool',
    claude_slash: 'Claude Slash',
    codex_dollar: 'Codex $',
    goal_directive: '/goal',
  }
  return labels[triggerType] || triggerType || 'unknown'
}

/**
 * @param {object} props
 * @param {boolean} props.open - 是否显示
 * @param {Function} props.onClose - 关闭回调
 * @param {{name:string, displayName?:string}|null} props.skill - 当前 skill
 * @param {number} [props.windowDays=30] - 时间窗
 */
export default function SkillRunSamplesModal({ open, onClose, skill, windowDays = 30 }) {
  const [status, setStatus] = useState('idle')
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!open || !skill?.name) return
    const api = typeof window !== 'undefined' ? window.electronAPI : null
    if (!api || typeof api.listSkillRunSamples !== 'function') {
      setStatus('error')
      return
    }

    let cancelled = false
    setStatus('loading')
    setData(null)
    api
      .listSkillRunSamples({ skillName: skill.name, windowDays })
      .then((res) => {
        if (cancelled) return
        if (!res || !res.success || !res.data) {
          setStatus('error')
          return
        }
        setData(res.data)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [open, skill?.name, windowDays])

  const samples = data?.samples || []
  const totals = data?.totals || {}

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${skill?.displayName || skill?.name || 'Skill'} · 运行样本`}
      size="lg"
      footer={<Button variant="secondary" onClick={onClose}>关闭</Button>}
    >
      <div className="skill-run-modal">
        <div className="skill-run-summary">
          <span>近 {windowDays} 天</span>
          <span>{totals.rawEvents || 0} raw</span>
          <span>{totals.logicalRecords || 0} logical</span>
          <span>{totals.usableSamples || 0} usable</span>
        </div>

        {status === 'loading' && <div className="skill-run-state">正在清洗运行日志...</div>}
        {status === 'error' && <div className="skill-run-state skill-run-state--error">运行样本读取失败</div>}
        {status === 'ready' && samples.length === 0 && (
          <div className="skill-run-state">没有可用运行样本。0 次不等于一定没用过，可能是隐式触发或日志不可观测。</div>
        )}

        {status === 'ready' && samples.length > 0 && (
          <div className="skill-run-list">
            {samples.map((sample) => (
              <div className="skill-run-item" key={sample.sampleId}>
                <div className="skill-run-item-head">
                  <span className="skill-run-time">{formatTime(sample.timestamp)}</span>
                  <Tag variant="info">{sample.tool}</Tag>
                  <Tag variant="default">{labelForTrigger(sample.triggerType)}</Tag>
                </div>
                <div className="skill-run-preview">{sample.userGoalPreview || '无目标摘要'}</div>
                <div className="skill-run-meta">
                  <span>{sample.sourceSession}</span>
                  <span>lines {(sample.sourceLines || []).join(', ')}</span>
                  <span>{sample.classificationReason}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
