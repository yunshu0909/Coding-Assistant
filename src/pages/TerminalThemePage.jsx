/**
 * 终端外观页 — V1.6.0
 *
 * 负责：
 * - 左栏展示 6 套内置主题（3 浅 + 3 深）
 * - 右栏展示选中主题的 ANSI 色卡 + 模拟终端 + [设为默认] 按钮
 * - 顶部非 Clear Dark 时显示 [恢复系统默认] 按钮
 * - 所有 IO 通过 useTerminalThemes hook 调 window.electronAPI.terminalTheme.*
 *
 * 技术限制：
 * - 不尝试改当前已打开的 Terminal 窗口（Terminal.app 对已开窗口不重绘）
 * - 文案明确告知"新开立即生效,正在用的窗口需关闭重开"
 *
 * @module pages/TerminalThemePage
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import PageShell from '../components/PageShell'
import StateView from '../components/StateView/StateView'
import Button from '../components/Button/Button'
import Toast from '../components/Toast'
import ThemeCard from './terminal-theme/ThemeCard'
import ThemePreview from './terminal-theme/ThemePreview'
import { useTerminalThemes } from './terminal-theme/useTerminalThemes'
import './terminal-theme/terminal-theme.css'

const DEFAULT_NOTE = '应用后,新开的 Terminal 立即生效;正在用的窗口需关闭重开'

export default function TerminalThemePage() {
  const {
    themes,
    currentDefault,
    loading,
    error,
    reload,
    setDefault,
    restoreSystemDefault,
  } = useTerminalThemes()

  // 当前选中预览的主题 id;null = 未选(加载中或加载失败)
  const [selectedId, setSelectedId] = useState(null)
  // 正在应用某主题(loading 态)
  const [saving, setSaving] = useState(false)
  // Toast { message, type: 'success'|'error' }
  const [toast, setToast] = useState(null)

  // 3 套主题全部按原顺序竖排(不分浅/深组,卡数少时分组反而视觉碎)

  // 初始选中:当前默认(如在 6 套里)或第一套
  useEffect(() => {
    if (selectedId || themes.length === 0) return
    const matchCurrent = themes.find((t) => t.predictedSystemKey === currentDefault)
    setSelectedId(matchCurrent?.id || themes[0].id)
  }, [themes, currentDefault, selectedId])

  const selectedTheme = useMemo(
    () => themes.find((t) => t.id === selectedId) || null,
    [themes, selectedId],
  )

  const isCurrentDefault = useMemo(
    () => !!selectedTheme && selectedTheme.predictedSystemKey === currentDefault,
    [selectedTheme, currentDefault],
  )

  // [恢复系统默认] 按钮可见性
  const showRestoreButton =
    currentDefault != null && currentDefault !== 'Clear Dark'

  // ---------- Handlers ----------

  const handleSetDefault = useCallback(async (themeId) => {
    setSaving(true)
    setToast(null)
    const r = await setDefault(themeId)
    setSaving(false)
    if (r?.success) {
      const theme = themes.find((t) => t.id === themeId)
      setToast({
        type: 'success',
        message: `已把 ${theme?.name || '主题'} 设为默认 · 新开窗口立即生效`,
      })
    } else {
      setToast({
        type: 'error',
        message: r?.error === 'UNKNOWN_THEME' ? '未知主题' : '写入失败,请检查 plist 权限',
      })
    }
  }, [setDefault, themes])

  const handleRestore = useCallback(async () => {
    setSaving(true)
    setToast(null)
    const r = await restoreSystemDefault()
    setSaving(false)
    if (r?.success) {
      setToast({ type: 'success', message: '已恢复系统默认 Clear Dark' })
    } else {
      setToast({ type: 'error', message: r?.error || '恢复失败' })
    }
  }, [restoreSystemDefault])

  // ---------- footer note 文案 ----------

  let footerNote = DEFAULT_NOTE
  let footerVariant = null
  if (saving) {
    footerNote = '⏳ 正在写入系统偏好,刷 cfprefsd 缓存...'
  } else if (isCurrentDefault && selectedTheme) {
    footerNote = `✓ ${selectedTheme.name} 已是当前默认`
    footerVariant = 'success'
  }

  // ---------- Render ----------

  const actions = showRestoreButton ? (
    <Button variant="ghost" onClick={handleRestore} disabled={saving}>
      恢复系统默认
    </Button>
  ) : null

  return (
    <PageShell
      title="终端外观"
      subtitle="给你的 Terminal 换个顺眼的配色 · 新开的窗口立即生效,正在用的窗口需关闭重开"
      actions={actions}
      className="page-shell--no-padding"
    >
      <StateView
        loading={loading}
        error={error?.message}
        onRetry={reload}
        empty={!loading && !error && themes.length === 0}
        emptyMessage="未找到任何主题"
      >
        <div className="tt-split">
          <section className="tt-left-pane">
            <div className="tt-theme-grid">
              {themes.map((t) => (
                <ThemeCard
                  key={t.id}
                  theme={t}
                  isActive={t.predictedSystemKey === currentDefault}
                  isSelected={t.id === selectedId}
                  onClick={() => setSelectedId(t.id)}
                />
              ))}
            </div>
          </section>

          <ThemePreview
            theme={selectedTheme}
            isCurrentDefault={isCurrentDefault}
            saving={saving}
            footerNote={footerNote}
            footerNoteVariant={footerVariant}
            onSetDefault={handleSetDefault}
          />
        </div>
      </StateView>

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
