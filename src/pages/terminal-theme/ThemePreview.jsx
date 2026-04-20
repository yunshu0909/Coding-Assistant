/**
 * 主题预览区
 *
 * 展示内容：
 * - 主题名 + bg/fg hex 值
 * - ANSI 16 色 palette
 * - 高保真模拟终端（prompt / ls / git / 代码 多种色彩场景）
 * - footer：状态文案 + [设为默认] 按钮
 *
 * 主题配色通过 inline style 传入 --term-* CSS 变量,不污染全局。
 *
 * @module pages/terminal-theme/ThemePreview
 */

import React from 'react'
import Button from '../../components/Button/Button'
import ClaudeRealTerminal from './ClaudeRealTerminal'

/**
 * 构造预览区 CSS 变量（本地 scope，不污染页面其他元素）
 */
function buildThemeVars(theme) {
  const c = theme.colors
  const a = c.ansi
  const s = c.syntax
  return {
    '--term-bg': c.bg,
    '--term-fg': c.fg,
    '--term-red': a.red,
    '--term-green': a.green,
    '--term-yellow': a.yellow,
    '--term-blue': a.blue,
    '--term-purple': a.purple,
    '--term-magenta': a.magenta,
    '--term-cyan': a.cyan,
    '--term-gray': a.gray,
    '--term-user': s.user,
    '--term-path': s.path,
    '--term-prompt': s.prompt,
    '--term-dir': s.dir,
    '--term-exec': s.exec,
    '--term-comment': s.comment,
    '--term-keyword': s.keyword,
    '--term-string': s.string,
    '--term-number': s.number,
  }
}

export default function ThemePreview({
  theme,
  isCurrentDefault,
  saving,
  footerNote,
  footerNoteVariant,
  onSetDefault,
}) {
  if (!theme) return null
  const { name, colors } = theme

  const buttonLabel = saving
    ? '正在应用...'
    : isCurrentDefault
      ? '设为默认'
      : `把 ${name} 设为默认`

  const noteClass = [
    'tt-preview-footer-note',
    footerNoteVariant === 'success' && 'tt-preview-footer-note--success',
    footerNoteVariant === 'danger' && 'tt-preview-footer-note--danger',
  ].filter(Boolean).join(' ')

  return (
    <section className="tt-preview-pane" style={buildThemeVars(theme)}>

      {/*
        v1.7:xterm.js 嵌入真 `claude --bare` 进程
        用户切主题 → xterm setTheme 实时重绘,所见即所得
        0 API quota 消耗(不发消息)
      */}
      <ClaudeRealTerminal theme={theme} />

      <div className="tt-preview-footer">
        <div className={noteClass}>{footerNote}</div>
        <Button
          variant="primary"
          size="lg"
          disabled={isCurrentDefault || saving}
          loading={saving}
          onClick={() => onSetDefault(theme.id)}
        >
          {buttonLabel}
        </Button>
      </div>
    </section>
  )
}
