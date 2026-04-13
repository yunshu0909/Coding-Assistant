/**
 * Claude 会员额度满载率趋势卡 (v1.4.1)
 *
 * 负责：
 * - 展示最近 4 个已完成 7d 周期的峰值柱状条
 * - 展示本周进行中（不计入满载率）
 * - 计算并显示满载率 = 已完成周期峰值的算术平均值
 * - 数据不足时降级展示（0 个周期引导 / 1-3 个标注数量 / 4+ 正常）
 *
 * 视觉规则：
 * - 满载率高 = 用得值 = 好事，全部用品牌蓝色系 (--color-primary)，不套红/黄/绿告警色
 * - 通过 opacity 区分层级：本周进行中 0.6 / 历史条 0.45 / 满载率数字 1.0
 *
 * @module pages/usage/components/ClaudeUsageTrendCard
 */

import './ClaudeUsageTrendCard.css'

/**
 * 格式化 Unix 时间戳为 "M/D" 形式（用于日期范围展示）
 * @param {number|null|undefined} unixSeconds - Unix 秒时间戳
 * @returns {string}
 */
function formatShortDate(unixSeconds) {
  if (!unixSeconds) return '--'
  const date = new Date(Number(unixSeconds) * 1000)
  if (Number.isNaN(date.getTime())) return '--'
  return `${date.getMonth() + 1}/${date.getDate()}`
}

/**
 * 格式化距重置时间（参考 ClaudeUsageStatusCard 的 formatResetTime 但更紧凑）
 * @param {number|null|undefined} unixSeconds
 * @returns {string} 如 "2 天 16h" / "16h 23m" / "23m"
 */
function formatRemaining(unixSeconds) {
  if (!unixSeconds) return ''
  const date = new Date(Number(unixSeconds) * 1000)
  if (Number.isNaN(date.getTime())) return ''
  const diffMs = Math.max(0, date.getTime() - Date.now())
  const totalMinutes = Math.floor(diffMs / 60000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days} 天 ${hours}h`
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  return `${minutes}m`
}

/**
 * 计算满载率（取最近 4 个已完成周期峰值的算术平均）
 * @param {Array<{peakPercentage: number}>} completedCycles - 已完成周期数组（最新在前）
 * @returns {{value: number|null, count: number}}
 *   value: 满载率百分比（0-100），不足则用实际数量算；0 个周期时为 null
 *   count: 参与计算的周期数（≤ 4）
 */
function computeUtilization(completedCycles) {
  if (!Array.isArray(completedCycles) || completedCycles.length === 0) {
    return { value: null, count: 0 }
  }
  const recent = completedCycles.slice(0, 4)
  const sum = recent.reduce((acc, cycle) => {
    const v = Number(cycle?.peakPercentage)
    return acc + (Number.isFinite(v) ? v : 0)
  }, 0)
  return {
    value: Math.round(sum / recent.length),
    count: recent.length,
  }
}

/**
 * 渲染本周进行中条
 * @param {object} props
 * @param {object|null} props.snapshot - 当前快照（提供当前 7d 百分比和重置时间）
 * @returns {JSX.Element|null}
 */
function CurrentWeekBar({ snapshot }) {
  const pct = snapshot?.sevenDayUsedPercentage
  const resetsAt = snapshot?.sevenDayResetsAt
  const hasValue = Number.isFinite(Number(pct))
  const pctNum = hasValue ? Math.max(0, Math.min(100, Number(pct))) : 0
  const periodStartSec = resetsAt ? Number(resetsAt) - 7 * 86400 : null
  const remaining = formatRemaining(resetsAt)

  return (
    <div className="trend-current-week">
      <div className="trend-current-week__head">
        <span className="trend-current-week__label">
          <span className="trend-current-week__dot" aria-hidden="true" />
          本周进行中
        </span>
        <span className="trend-current-week__pct">
          {hasValue ? `${Math.round(pctNum)}%` : '--'}
        </span>
      </div>
      <div className="trend-current-week__track">
        <div
          className="trend-current-week__fill"
          style={{ width: `${pctNum}%` }}
        />
      </div>
      <div className="trend-current-week__meta">
        <span>
          {periodStartSec ? formatShortDate(periodStartSec) : '--'}
          {' → '}
          {resetsAt ? formatShortDate(resetsAt) : '--'}
          {remaining && <> · 距重置 {remaining}</>}
        </span>
        <span className="trend-current-week__tag">不计入满载率</span>
      </div>
    </div>
  )
}

/**
 * 渲染单个已完成周期行
 * @param {object} props
 * @param {object} props.cycle - 周期数据 { periodStart, periodEnd, peakPercentage }
 * @returns {JSX.Element}
 */
function HistoryRow({ cycle }) {
  const peak = Number(cycle?.peakPercentage)
  const pctNum = Number.isFinite(peak) ? Math.max(0, Math.min(100, peak)) : 0
  return (
    <div className="trend-history-row">
      <span className="trend-history-row__date">
        {formatShortDate(cycle?.periodStart)} → {formatShortDate(cycle?.periodEnd)}
      </span>
      <div className="trend-history-row__bar">
        <div
          className="trend-history-row__fill"
          style={{ width: `${pctNum}%` }}
        />
      </div>
      <span className="trend-history-row__pct">
        {Number.isFinite(peak) ? `${Math.round(peak)}%` : '--'}
      </span>
    </div>
  )
}

/**
 * 满载率趋势卡
 * @param {object} props
 * @param {object|null} props.snapshot - 当前额度快照
 * @param {Array} props.completedCycles - 已完成周期（最新在前）
 * @param {boolean} [props.stale] - 是否为快照过期态，用于同步半透明
 * @returns {JSX.Element}
 */
export default function ClaudeUsageTrendCard({ snapshot, completedCycles, stale = false }) {
  const cycles = Array.isArray(completedCycles) ? completedCycles : []
  const utilization = computeUtilization(cycles)
  const displayCycles = cycles.slice(0, 4)
  const hasAnyCycles = displayCycles.length > 0

  // 副标题：根据已完成周期数量分档展示
  let subtitle
  if (utilization.count === 0) {
    subtitle = '完整用完 1 个 7 天周期后出现趋势'
  } else if (utilization.count < 4) {
    subtitle = `基于 ${utilization.count} 个已完成的 7 天周期`
  } else {
    subtitle = '基于最近 4 个已完成的 7 天周期'
  }

  return (
    <section className={`trend-card${stale ? ' trend-card--stale' : ''}`}>
      <header className="trend-card__header">
        <div className="trend-card__title-group">
          <h2 className="trend-card__title">满载率趋势</h2>
          <div className="trend-card__subtitle">{subtitle}</div>
        </div>
        {utilization.value !== null ? (
          <div className="trend-card__value">
            <span className="trend-card__value-num">{utilization.value}</span>
            <span className="trend-card__value-unit">%</span>
          </div>
        ) : (
          <div className="trend-card__value trend-card__value--placeholder">
            <span className="trend-card__value-num">--</span>
          </div>
        )}
      </header>

      <div className="trend-card__body">
        <CurrentWeekBar snapshot={snapshot} />

        {hasAnyCycles && (
          <>
            <div className="trend-card__section-label">已完成周期</div>
            <div className="trend-card__history-list">
              {displayCycles.map((cycle, index) => (
                <HistoryRow
                  key={`${cycle?.periodEnd ?? 'cycle'}-${index}`}
                  cycle={cycle}
                />
              ))}
            </div>
          </>
        )}

        {!hasAnyCycles && (
          <div className="trend-card__empty-hint">
            完整用完 1 个 7 天周期后,这里会出现你的满载率趋势。
          </div>
        )}
      </div>

      <footer className="trend-card__footer">
        {utilization.count === 0 && <span>暂无已完成周期</span>}
        {utilization.count > 0 && utilization.count < 4 && (
          <span>
            共 {utilization.count} 个已完成周期 · 数据积累中
          </span>
        )}
        {utilization.count >= 4 && (
          <>
            <span>共 {cycles.length} 个已完成周期（展示最近 4 个）</span>
            <span>满载率 = 峰值平均</span>
          </>
        )}
      </footer>
    </section>
  )
}
