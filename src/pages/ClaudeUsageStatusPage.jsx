/**
 * Claude Code 会员额度状态页面
 *
 * 负责：
 * - 作为 Claude Code 专属能力的独立页面入口
 * - 展示 Claude Code 会员额度接入状态与最近一次快照
 * - 提供显示模式与阈值配置入口
 * - 保存配置后 Toast 提示成功/失败
 *
 * @module pages/ClaudeUsageStatusPage
 */

import { useCallback, useState } from 'react'
import PageShell from '../components/PageShell'
import Toast from '../components/Toast'
import ClaudeUsageStatusCard from './usage/components/ClaudeUsageStatusCard'
import useClaudeUsageStatus from './usage/useClaudeUsageStatus'
import './usage.css'

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
    formConfig,
    loadStatus,
    ensureInstalled,
    updateFormConfig,
    saveConfig,
  } = useClaudeUsageStatus()

  // Toast 提示状态
  const [toast, setToast] = useState(null)

  /**
   * 包装 saveConfig，保存后触发 Toast 反馈
   */
  const handleSave = useCallback(async () => {
    const ok = await saveConfig()
    setToast(ok
      ? { message: '显示设置已保存', type: 'success' }
      : { message: '保存失败，请重试', type: 'error' })
  }, [saveConfig])

  return (
    <PageShell
      title="Claude 会员额度"
      subtitle="查看 Claude Code 官方 rate_limits，管理底部状态栏的显示方式。"
    >
      <ClaudeUsageStatusCard
        statusState={statusState}
        loading={loading}
        installing={installing}
        saving={saving}
        error={error}
        formConfig={formConfig}
        onFormChange={updateFormConfig}
        onSave={handleSave}
        onRefresh={loadStatus}
        onEnsureInstalled={ensureInstalled}
      />
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
