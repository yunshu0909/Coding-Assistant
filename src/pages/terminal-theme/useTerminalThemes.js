/**
 * 终端外观数据 hook
 *
 * 负责：
 * - 调 `window.electronAPI.terminalTheme.list` 加载 6 套内置主题 + 当前系统默认
 * - 暴露 `setDefault(themeId)` / `restoreSystemDefault()` 给页面
 * - 操作成功后自动 reload
 *
 * @module pages/terminal-theme/useTerminalThemes
 */

import { useCallback, useEffect, useState } from 'react'

export function useTerminalThemes() {
  const [themes, setThemes] = useState([])
  const [currentDefault, setCurrentDefault] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.terminalTheme.list()
      if (result?.success) {
        setThemes(result.themes || [])
        setCurrentDefault(result.currentDefault || null)
        setError(null)
      } else {
        setError(new Error(result?.error || 'LIST_FAILED'))
      }
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const setDefault = useCallback(async (themeId) => {
    const result = await window.electronAPI.terminalTheme.setDefault(themeId)
    if (result?.success) {
      // 强制回读系统 plist，避免 UI 和 Terminal 实际默认状态漂移
      await reload()
    }
    return result
  }, [reload])

  const restoreSystemDefault = useCallback(async () => {
    const result = await window.electronAPI.terminalTheme.restoreSystemDefault()
    if (result?.success) {
      await reload()
    }
    return result
  }, [reload])

  return {
    themes,
    currentDefault,
    loading,
    error,
    reload,
    setDefault,
    restoreSystemDefault,
  }
}
