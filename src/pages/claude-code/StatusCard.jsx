/**
 * 状态卡片组件
 *
 * 负责：
 * - 展示版本/认证/网络的概览状态
 * - 状态圆点（绿/黄/红/灰/加载态）
 * - 点击切换右侧详情面板
 *
 * @module pages/claude-code/StatusCard
 */

import React from 'react'

/**
 * 状态到圆点 CSS 类的映射
 * @type {Object<string, string>}
 */
const STATUS_DOT_CLASS = {
  ok: 'green',
  warn: 'yellow',
  error: 'red',
  loading: 'loading',
  unknown: 'gray',
}

/**
 * 状态卡片
 * @param {Object} props
 * @param {string} props.title - 卡片标题（版本/认证/网络）
 * @param {'ok'|'warn'|'error'|'loading'|'unknown'} props.status - 状态标识
 * @param {string} props.value - 主值（如 "v2.1.63"、"已登录"、"5/5 PASS"）
 * @param {string} props.desc - 描述文案（如 "已是最新"、"OAuth 认证"）
 * @param {boolean} props.active - 是否选中态
 * @param {Function} props.onClick - 点击回调
 * @returns {React.ReactElement}
 */
export default function StatusCard({ title, status, value, desc, active, onClick }) {
  const dotClass = STATUS_DOT_CLASS[status] || 'gray'

  return (
    <div
      className={`status-card${active ? ' active' : ''}`}
      onClick={onClick}
    >
      <div className="status-card-header">
        <span className="status-card-label">{title}</span>
        <span className={`status-dot ${dotClass}`} />
      </div>
      <div className="status-card-value">{value || '—'}</div>
      <div className="status-card-desc">{desc || ''}</div>
    </div>
  )
}
