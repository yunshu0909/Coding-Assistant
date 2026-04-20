/**
 * 实时 Claude Code 预览终端 (v1.7)
 *
 * 用 xterm.js 嵌一个真实的 `claude --bare` 进程,把 Claude Code 的实际 ANSI 输出
 * 完整渲染出来。主题切换通过 xterm 的 `options.theme` 热应用,无需重启 pty。
 *
 * 交互约定:
 * - 组件 mount 时后端 spawn claude --bare,stdout 流到 xterm
 * - theme prop 变化 → xterm setTheme,Claude banner 在新调色板下立即重绘
 * - 组件 unmount 时 send stop,后端 kill pty(清理资源)
 * - 用户不输入消息 = 不触发 API 请求 = 0 quota 消耗
 *
 * @module pages/terminal-theme/ClaudeRealTerminal
 */

import React, { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

/**
 * 把 themes-meta.json 里一套主题转成 xterm.js 的 ITheme
 * themes-meta 只有 8 个基础 ANSI,我们同时给 bright 一套(用 fg/bg 变种填充)
 */
function toXtermTheme(theme) {
  if (!theme) return undefined
  const c = theme.colors
  const a = c.ansi
  return {
    background: c.bg,
    foreground: c.fg,
    cursor: c.fg,
    cursorAccent: c.bg,
    selectionBackground: theme.isDark ? '#44475a' : '#cce0ff',
    // 16 色 ANSI
    black: theme.isDark ? '#21222c' : '#000000',
    red: a.red,
    green: a.green,
    yellow: a.yellow,
    blue: a.blue,
    magenta: a.magenta,
    cyan: a.cyan,
    white: theme.isDark ? c.fg : '#d6d6d6',
    brightBlack: a.gray,
    brightRed: a.red,
    brightGreen: a.green,
    brightYellow: a.yellow,
    brightBlue: a.blue,
    brightMagenta: a.purple,
    brightCyan: a.cyan,
    brightWhite: theme.isDark ? '#ffffff' : c.fg,
  }
}

export default function ClaudeRealTerminal({ theme }) {
  const containerRef = useRef(null)
  const termRef = useRef(null)
  const fitRef = useRef(null)
  const unsubscribesRef = useRef([])

  // 初始化 xterm + pty(只跑一次)
  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      fontFamily: "'SF Mono', Menlo, Monaco, 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: false,
      allowTransparency: false,
      theme: toXtermTheme(theme),
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)

    try {
      fit.fit()
    } catch {}

    termRef.current = term
    fitRef.current = fit

    // 订阅 pty 数据
    const offData = window.electronAPI.terminalPreview.onData((data) => {
      term.write(data)
    })
    const offExit = window.electronAPI.terminalPreview.onExit(() => {
      term.writeln('\r\n\x1b[90m[Claude Code exited]\x1b[0m')
    })
    const offError = window.electronAPI.terminalPreview.onError((msg) => {
      term.writeln(`\r\n\x1b[31m[预览启动失败]\x1b[0m ${msg}`)
    })
    unsubscribesRef.current = [offData, offExit, offError]

    // 键盘输入回传到 pty(让用户能按 1+Enter 通过 trust 页,或随意跟 claude 聊)
    const dataDisposable = term.onData((input) => {
      try { window.electronAPI.terminalPreview.write(input) } catch {}
    })

    // 通知后端 spawn claude
    window.electronAPI.terminalPreview.start(term.cols, term.rows)

    // 窗口尺寸变化时自适应
    const onResize = () => {
      try {
        fit.fit()
        window.electronAPI.terminalPreview.resize(term.cols, term.rows)
      } catch {}
    }
    window.addEventListener('resize', onResize)

    // ResizeObserver 监听容器自身变化(比如左栏展开/收起)
    const ro = new ResizeObserver(() => onResize())
    ro.observe(containerRef.current)

    return () => {
      window.removeEventListener('resize', onResize)
      ro.disconnect()
      try { dataDisposable.dispose() } catch {}
      unsubscribesRef.current.forEach((fn) => { try { fn() } catch {} })
      unsubscribesRef.current = []
      try { window.electronAPI.terminalPreview.stop() } catch {}
      try { term.dispose() } catch {}
      termRef.current = null
      fitRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // 只 mount 一次 —— 主题变化走下面另一个 effect

  // 主题切换(热应用,不重启 pty)
  useEffect(() => {
    if (!termRef.current || !theme) return
    termRef.current.options.theme = toXtermTheme(theme)
  }, [theme])

  return (
    <div
      ref={containerRef}
      className="tt-real-terminal"
      style={{ background: theme?.colors?.bg || '#282A36' }}
    />
  )
}
