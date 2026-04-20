/**
 * 主题卡片
 *
 * 展示主题名、16 色缩略色卡、背景色小样 + 简短描述。
 * 支持选中态（蓝框）、激活态（左彩条 + "当前" Tag）、可点击切换预览。
 *
 * @module pages/terminal-theme/ThemeCard
 */

import React from 'react'

export default function ThemeCard({ theme, isActive, isSelected, onClick }) {
  const { name, description, colors } = theme
  const ansi = colors.ansi

  const topRow = [
    colors.fg, ansi.red, ansi.green, ansi.yellow,
    ansi.blue, ansi.magenta, ansi.cyan, ansi.gray,
  ]

  const classes = [
    'theme-card',
    isSelected ? 'theme-card--selected' : '',
    isActive ? 'theme-card--active' : '',
  ].filter(Boolean).join(' ')

  return (
    <button type="button" className={classes} onClick={onClick}>
      <div className="theme-card-head">
        <div className="theme-card-name">{name}</div>
        {isActive && <span className="theme-card-tag">当前</span>}
      </div>
      <div className="theme-thumbnail">
        <div className="theme-thumbnail-row">
          {topRow.map((c, i) => (
            <div key={i} style={{ background: c }} />
          ))}
        </div>
        <div className="theme-thumbnail-row">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ background: colors.bg }} />
          ))}
        </div>
      </div>
      <div className="theme-card-meta">
        <div className="theme-card-bg-sample" style={{ background: colors.bg }} />
        <span>{description}</span>
      </div>
    </button>
  )
}
