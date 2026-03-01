/**
 * WorkbenchLayout - 工作台布局组件
 *
 * 负责：
 * - macOS 风格的标题栏（红绿灯窗口控制按钮）
 * - 左侧导航侧边栏（技能管理、用量监测）
 * - 模块切换状态管理
 * - 内容区域渲染
 *
 * @module components/WorkbenchLayout
 */

import React from 'react'
import '../styles/workbench.css'
import pkg from '../../package.json'

/**
 * 工作台布局组件
 * @param {Object} props
 * @param {React.ReactNode} props.children - 内容区域要渲染的子元素
 * @param {'skills'|'mcp'|'usage'|'api'|'project-init'|'permission'} props.activeModule - 当前激活的模块
 * @param {function} props.onModuleChange - 模块切换回调函数
 * @returns {React.ReactElement}
 */
function WorkbenchLayout({ children, activeModule, onModuleChange }) {
  /**
   * 导航项配置
   * @type {Array<{id: string, label: string, icon: string}>}
   */
  const navItems = [
    { id: 'skills', label: 'Skills 管理', icon: '🛠️' },
    { id: 'mcp', label: 'MCP 管理', icon: '📡' },
    { id: 'project-init', label: '新建项目', icon: '🚀' },
    { id: 'claude-code', label: 'Claude Code', icon: '💻' },
    { id: 'usage', label: '用量监测', icon: '📊' },
    { id: 'api', label: 'API 配置', icon: '🔌' },
    { id: 'permission', label: '启动模式', icon: '🛡️' }
  ]

  /**
   * 处理导航项点击
   * @param {string} moduleId - 模块 ID
   */
  const handleNavClick = (moduleId) => {
    if (moduleId !== activeModule && onModuleChange) {
      onModuleChange(moduleId)
    }
  }

  return (
    <div className="workbench-layout">
      {/* 顶部占位条：为 macOS 原生标题栏预留空间，避免与页面内容重叠 */}
      <div className="title-spacer" />

      {/* 主内容区 */}
      <div className="main-container">
        {/* 左侧边栏 */}
        <aside className="sidebar">
          {/* 品牌区 */}
          <div className="sidebar-brand">CodePal</div>

          <nav className="sidebar-nav">
            {navItems.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${activeModule === item.id ? 'active' : ''}`}
                onClick={() => handleNavClick(item.id)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </button>
            ))}
          </nav>

          {/* 底部署名区 */}
          <div className="sidebar-footer">
            {/* 更新提醒预留位置：有新版本时渲染此块 */}
            {/* <div className="sidebar-update">🔔 发现新版本</div> */}
            <div className="sidebar-meta">v{pkg.version} · 云舒</div>
          </div>
        </aside>

        {/* 内容区域 */}
        <main className="content-area">
          {children}
        </main>
      </div>
    </div>
  )
}

export default WorkbenchLayout
