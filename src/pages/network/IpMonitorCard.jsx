/**
 * 公网 IP 检测卡片
 *
 * 负责：
 * - 展示当前 IP、采样指标、时间线
 * - 单次检测 + 持续监控启停
 * - 底栏显示轮次进度和倒计时
 * - 正常/切换/失败/关闭四种状态展示
 *
 * @module pages/network/IpMonitorCard
 */

import { useState, useEffect } from 'react'
import useIpMonitor from '../../hooks/useIpMonitor'
import Button from '../../components/Button/Button'
import Toggle from '../../components/Toggle'

const STATUS_BADGE = {
  idle:      { cls: 'nd-badge--idle', text: '按需检测', pulse: false },
  detecting: { cls: 'nd-badge--loading', text: '检测中', pulse: true },
  stable:    { cls: 'nd-badge--success', text: '稳定', pulse: true },
  switched:  { cls: 'nd-badge--warning', text: 'IP 切换', pulse: false },
  failed:    { cls: 'nd-badge--danger',  text: '获取失败', pulse: false },
  off:       { cls: 'nd-badge--idle',    text: '已停止', pulse: false },
}

/**
 * @param {Object} props
 * @param {(message: string, type: string) => void} props.onToast
 */
export default function IpMonitorCard({ onToast }) {
  const { state, probing, probeOnce, toggle } = useIpMonitor(onToast)

  // 只有持续监控开启时才每秒刷新轮次计时，idle 不留 renderer timer。
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!state?.isEnabled) return undefined
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [state?.isEnabled])

  // 数据还没从主进程拉到
  if (!state) {
    return (
      <div className="nd-card" style={{ height: '100%' }}>
        <div className="nd-card-header">
          <div>
            <div className="nd-card-title-row">
              <svg className="nd-card-title-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="9" cy="9" r="7"/><path d="M2 9h14M9 2a11 11 0 0 1 3 7 11 11 0 0 1-3 7 11 11 0 0 1-3-7 11 11 0 0 1 3-7z"/>
              </svg>
              公网 IP 检测
            </div>
            <div className="nd-card-desc">按需查看公网出口 IP；需要时再开启持续监控</div>
          </div>
        </div>
        <div className="nd-ip-current">
          <span className="nd-ip-address nd-ip-address--placeholder">—.—.—.—</span>
        </div>
        <div className="nd-running-bar">
          <span className="nd-running-text">正在读取检测状态…</span>
        </div>
      </div>
    )
  }

  const badge = STATUS_BADGE[state.status] || STATUS_BADGE.detecting
  const isFailed = state.status === 'failed'
  const isOff = state.status === 'off'
  const roundElapsedMs = state.roundStartTime ? Date.now() - state.roundStartTime : 0
  const roundMin = Math.floor(roundElapsedMs / 60000)
  const roundSec = Math.floor((roundElapsedMs % 60000) / 1000)
  const successRate = state.sampleCount > 0 ? Math.round((state.successCount / state.sampleCount) * 100) : 0

  return (
    <div className="nd-card" style={{ height: '100%' }}>
      <div className="nd-card-header">
        <div>
          <div className="nd-card-title-row">
            <svg className="nd-card-title-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="9" cy="9" r="7"/><path d="M2 9h14M9 2a11 11 0 0 1 3 7 11 11 0 0 1-3 7 11 11 0 0 1-3-7 11 11 0 0 1 3-7z"/>
            </svg>
            公网 IP 检测
          </div>
          <div className="nd-card-desc">按需查看公网出口 IP；需要时再开启持续监控</div>
        </div>
        <div className="nd-card-actions">
          <span className={`nd-badge ${badge.cls}`}>
            <span className={`nd-badge-dot${badge.pulse ? ' nd-badge-dot--pulse' : ''}`}></span>
            {badge.text}
          </span>
        </div>
      </div>

      {/* 当前 IP */}
      <div className="nd-ip-current">
        {state.currentIp && !isFailed ? (
          <>
            <span className="nd-ip-address">{state.currentIp}</span>
            {state.currentSource && <span className="nd-ip-source">via {state.currentSource}</span>}
          </>
        ) : isFailed ? (
          <span className="nd-ip-address nd-ip-address--fail">无法获取</span>
        ) : (
          <span className="nd-ip-address nd-ip-address--placeholder">—.—.—.—</span>
        )}
      </div>

      {/* 指标 */}
      <div className="nd-ip-metrics">
        <div className="nd-metric-item">
          <div className="nd-metric-label">已采样</div>
          <div className="nd-metric-value">{state.sampleCount} 次</div>
        </div>
        {isFailed ? (
          <>
            <div className="nd-metric-item">
              <div className="nd-metric-label">成功率</div>
              <div className="nd-metric-value nd-metric-value--danger">{successRate}%</div>
            </div>
            <div className="nd-metric-item">
              <div className="nd-metric-label">连续失败</div>
              <div className="nd-metric-value nd-metric-value--danger">{state.consecutiveFailCount} 次</div>
            </div>
          </>
        ) : (
          <>
            <div className="nd-metric-item">
              <div className="nd-metric-label">唯一 IP</div>
              <div className={`nd-metric-value${state.switchCount > 0 ? ' nd-metric-value--warning' : ''}`}>
                {state.uniqueIps.length || '—'}
              </div>
            </div>
            <div className="nd-metric-item">
              <div className="nd-metric-label">IP 切换</div>
              <div className={`nd-metric-value${state.switchCount > 0 ? ' nd-metric-value--warning' : ''}`}>
                {state.switchCount} 次
              </div>
            </div>
          </>
        )}
      </div>

      {/* 时间线 */}
      {state.timeline.length > 0 && (
        <>
          <div className="nd-timeline-title">采样时间线（最近 {state.timeline.length} 次）</div>
          <div className="nd-timeline">
            {state.timeline.map((point, i) => (
              <div
                key={i}
                className={`nd-timeline-dot${
                  point.type === 'switch' ? ' nd-timeline-dot--switch' :
                  point.type === 'fail' ? ' nd-timeline-dot--fail' : ''
                }`}
                title={point.ip || '获取失败'}
              />
            ))}
          </div>
        </>
      )}

      <div className="nd-ip-controls">
        <Button variant="primary" size="sm" onClick={probeOnce} loading={probing}>
          {probing ? '检测中...' : state.lastCheckedAt ? '再次检测' : '检测一次'}
        </Button>
        <div className="nd-monitor-toggle">
          <span>
            <strong>持续监控</strong>
            <small>{state.isEnabled ? '页面内 5 秒 · 离开后 60 秒' : '仅在明确开启后后台运行'}</small>
          </span>
          <Toggle checked={state.isEnabled} onChange={toggle} />
        </div>
      </div>

      {/* 底栏 */}
      <div className="nd-running-bar">
        {isOff ? (
          <span className="nd-running-text">持续监控已停止 · 保留最后一次检测结果</span>
        ) : state.status === 'idle' && !state.lastCheckedAt ? (
          <span className="nd-running-text">尚未开始 · 默认不会在后台查询公网 IP</span>
        ) : !state.currentIp && state.sampleCount === 0 ? (
          <span className="nd-running-text">正在获取公网 IP…</span>
        ) : isFailed ? (
          <span className="nd-running-text nd-running-text--danger">请检查网络连接或 VPN 状态</span>
        ) : state.isEnabled ? (
          <>
            <span className="nd-running-text">
              本轮 <strong>{roundMin} 分 {roundSec} 秒</strong> / 30 分钟
            </span>
            <span className="nd-running-text">持续监控中</span>
          </>
        ) : (
          <span className="nd-running-text">单次检测完成 · 未开启持续监控</span>
        )}
      </div>
    </div>
  )
}
