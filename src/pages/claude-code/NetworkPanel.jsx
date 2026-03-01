/**
 * 网络诊断详情面板
 *
 * 负责：
 * - 展示网络总览条（绿/黄/红 + 汇总文案）
 * - 5 项诊断检查明细列表
 * - FAIL 时展示修复建议
 * - 「重新检查」按钮
 *
 * @module pages/claude-code/NetworkPanel
 */

import React from 'react'
import Button from '../../components/Button/Button'

/**
 * 状态到图标字符映射
 * @type {Object<string, string>}
 */
const STATUS_ICON = {
  pass: '✓',
  warn: '!',
  fail: '✕',
}

/**
 * overall 状态到总览条样式类映射
 * @type {Object<string, string>}
 */
const SUMMARY_CLASS = {
  pass: 'healthy',
  warn: 'warning',
  fail: 'error',
}

/**
 * overall 状态到总览文案映射
 * @type {Object<string, string>}
 */
const SUMMARY_TEXT = {
  pass: '网络环境正常，可安全使用',
  warn: '网络可用但存在风险，建议检查代理配置',
  fail: '网络异常，使用 Claude Code 可能触发风控',
}

/**
 * overall 状态到总览图标映射
 * @type {Object<string, string>}
 */
const SUMMARY_ICON = {
  pass: '✓',
  warn: '⚠',
  fail: '✕',
}

/**
 * 网络诊断面板
 * @param {Object} props
 * @param {Object} props.networkInfo - 诊断结果 { overall, passCount, warnCount, failCount, checks }
 * @param {boolean} props.checking - 是否正在检查
 * @param {Function} props.onCheck - 重新检查回调
 * @param {string|null} props.lastCheckTime - 上次检查时间
 * @returns {React.ReactElement}
 */
export default function NetworkPanel({
  networkInfo,
  checking,
  onCheck,
  lastCheckTime,
}) {
  const { overall, passCount = 0, warnCount = 0, failCount = 0, checks = [] } = networkInfo || {}
  const total = passCount + warnCount + failCount
  const summaryClass = SUMMARY_CLASS[overall] || 'healthy'

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <span className="detail-title">网络诊断</span>
        <div className="detail-actions">
          <Button
            variant="primary"
            size="sm"
            loading={checking}
            onClick={onCheck}
          >
            重新检查
          </Button>
        </div>
      </div>

      <div className="detail-body">
        {/* 总览条 */}
        {overall && (
          <div className={`network-summary ${summaryClass}`}>
            <span className="network-summary-icon">{SUMMARY_ICON[overall]}</span>
            <span className="network-summary-text">{SUMMARY_TEXT[overall]}</span>
            <span className="network-summary-detail">{passCount}/{total} PASS</span>
          </div>
        )}

        {/* 检查项列表 */}
        {checks.length > 0 && (
          <div className="check-list">
            {checks.map((item, index) => (
              <div className="check-item" key={index}>
                <div className={`check-icon ${item.status}`}>
                  {STATUS_ICON[item.status] || '?'}
                </div>
                <span className="check-name">{item.name}</span>
                <span className="check-detail">{item.detail}</span>
              </div>
            ))}
          </div>
        )}

        {/* 无检查结果时的占位 */}
        {!overall && !checking && (
          <div style={{
            textAlign: 'center',
            padding: 'var(--space-10) 0',
            color: 'var(--text-tertiary)',
            fontSize: 'var(--text-sm)',
          }}>
            点击「重新检查」执行网络诊断
          </div>
        )}

        {/* FAIL 时修复建议 */}
        {overall === 'fail' && (
          <div className="repair-suggestions">
            <div className="repair-suggestions-title">修复建议</div>
            <ol>
              <li>重启 VPN 核心和终端，然后重新运行检查</li>
              <li>固定单个稳定的美国节点，关闭自动故障转移</li>
              <li>确保 Anthropic 直连和代理均返回 401 后再启动 Claude Code</li>
            </ol>
          </div>
        )}
      </div>

      <div className="detail-footer">
        <span className="detail-footer-text">
          {lastCheckTime ? `上次检查: ${lastCheckTime}` : ''}
        </span>
      </div>
    </div>
  )
}
