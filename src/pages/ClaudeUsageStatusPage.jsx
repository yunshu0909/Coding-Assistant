/**
 * Claude Code 会员额度状态页面
 *
 * 负责：
 * - 作为 Claude Code 专属能力的独立页面入口
 * - 展示 Claude Code 会员额度接入状态与最近一次快照
 * - v1.4.1：新增满载率趋势卡，展示最近 4 个已完成 7d 周期的峰值与平均值
 * - v1.4.1：显示设置从独立卡片迁移至弹窗（齿轮按钮触发）
 * - 保存配置后 Toast 提示成功/失败
 *
 * @module pages/ClaudeUsageStatusPage
 */

import { useCallback, useState } from 'react'
import PageShell from '../components/PageShell'
import Button from '../components/Button/Button'
import Toast from '../components/Toast'
import ClaudeUsageStatusCard from './usage/components/ClaudeUsageStatusCard'
import ClaudeUsageTrendCard from './usage/components/ClaudeUsageTrendCard'
import ClaudeUsageSettingsModal from './usage/components/ClaudeUsageSettingsModal'
import useClaudeUsageStatus from './usage/useClaudeUsageStatus'
import './usage.css'

/**
 * 齿轮按钮 disabled 的集成状态
 * 这些状态下用户还没完成接入，或接入失败，不应该允许打开设置弹窗
 */
const SETTINGS_DISABLED_STATES = new Set([
  'not_installed',
  'not_configured',
  'conflict',
  'setup_failed',
])

/**
 * 是否展示满载率趋势卡
 * 规则：仅在已接入且有 rate_limits 数据时展示（ready / off 模式 / stale 态）
 *
 * @param {object|null} statusState - 后端 IPC 返回的状态
 * @returns {boolean}
 */
function shouldShowTrendCard(statusState) {
  if (!statusState) return false
  if (statusState.integrationState !== 'ready') return false
  // 必须有 rate_limits 数据才有意义算满载率
  return Boolean(statusState.snapshot?.hasRateLimits)
}

/**
 * 判断快照是否过期（与 ClaudeUsageStatusCard 的判定对齐：updatedAt 距今 > 2 小时）
 *
 * @param {object|null} statusState
 * @returns {boolean}
 */
function isSnapshotStale(statusState) {
  if (!statusState || statusState.integrationState !== 'ready') return false
  const updatedAt = statusState.snapshot?.updatedAt
  if (!updatedAt) return false
  // v1.4.1: 与 ClaudeUsageStatusCard.jsx 的 STALE_MS 严格一致（2 小时）
  const STALE_MS = 2 * 60 * 60 * 1000
  return (Date.now() - Number(updatedAt) * 1000) > STALE_MS
}

/**
 * Claude Code 会员额度状态页面
 * @returns {JSX.Element}
 */
export default function ClaudeUsageStatusPage() {
  const {
    statusState,
    loading,
    installing,
    saving,
    error,
    history,
    loadStatus,
    loadHistory,
    ensureInstalled,
    saveConfig,
  } = useClaudeUsageStatus()

  // Toast 提示状态
  const [toast, setToast] = useState(null)
  // 显示设置弹窗开关
  const [settingsOpen, setSettingsOpen] = useState(false)

  /**
   * 刷新：同时刷新状态快照和满载率历史
   */
  const handleRefresh = useCallback(() => {
    loadStatus()
    loadHistory()
  }, [loadStatus, loadHistory])

  /**
   * 保存配置 — 接收弹窗传来的 draft 并保存，成功弹 Toast
   * @param {object} draft - 弹窗里的本地 draft 配置
   * @returns {Promise<boolean>} 供弹窗判断是否关闭自己
   */
  const handleSave = useCallback(async (draft) => {
    const ok = await saveConfig(draft)
    setToast(ok
      ? { message: '显示设置已保存', type: 'success' }
      : { message: '保存失败，请重试', type: 'error' })
    return ok
  }, [saveConfig])

  const trendVisible = shouldShowTrendCard(statusState)
  const staleFlag = isSnapshotStale(statusState)
  const integrationState = statusState?.integrationState
  const settingsDisabled = !statusState || SETTINGS_DISABLED_STATES.has(integrationState)

  // 页面标题右侧的"显示设置"按钮
  const headerActions = (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => setSettingsOpen(true)}
      disabled={settingsDisabled}
      title={settingsDisabled ? '需要先完成 Claude Code 会员额度接入' : '打开实时额度显示设置'}
    >
      <span aria-hidden="true" style={{ marginRight: 4 }}>⚙</span>
      显示设置
    </Button>
  )

  return (
    <PageShell
      title="Claude 会员额度"
      subtitle="查看 Claude Code 官方 rate_limits，管理底部状态栏的显示方式。"
      actions={headerActions}
    >
      {/* 卡片 1：会员额度（实时 5h/7d） */}
      <ClaudeUsageStatusCard
        statusState={statusState}
        loading={loading}
        installing={installing}
        error={error}
        onRefresh={handleRefresh}
        onEnsureInstalled={ensureInstalled}
      />

      {/* 卡片 2：满载率趋势（仅在 ready + hasRateLimits 时渲染） */}
      {trendVisible && (
        <ClaudeUsageTrendCard
          snapshot={statusState?.snapshot}
          completedCycles={history.completedCycles}
          stale={staleFlag}
        />
      )}

      {/* 显示设置弹窗 */}
      <ClaudeUsageSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialConfig={statusState?.config}
        onSave={handleSave}
        saving={saving}
      />

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </PageShell>
  )
}
