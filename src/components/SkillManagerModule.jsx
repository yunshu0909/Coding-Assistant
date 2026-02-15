/**
 * Skill Manager 模块容器组件
 *
 * 负责：
 * - 管理子页面状态（manage/config/import）
 * - 渲染 ManagePage、ConfigPage 或 ImportPage
 * - 提供页面间导航回调
 * - 处理首次导入和重新导入流程
 * - 将自动刷新信号透传给管理页
 *
 * @module SkillManagerModule
 */

import React, { useState, useCallback } from 'react'
import ManagePage from '../pages/ManagePage'
import ConfigPage from '../pages/ConfigPage'
import ImportPage from '../pages/ImportPage'

/**
 * Skill Manager 模块容器
 * @param {Object} props - 组件属性
 * @param {'manage'|'import'} [props.initialPage='manage'] - 初始子页面，由 App 根据中央仓库状态传入
 * @param {Function} props.onAfterImport - 导入完成后通知 App 执行推送目标初始化
 * @param {number} [props.refreshSignal=0] - 自动刷新信号
 * @returns {JSX.Element} 模块容器组件
 */
export default function SkillManagerModule({ initialPage = 'manage', onAfterImport, refreshSignal = 0 }) {
  // 当前子页面：'manage'、'config' 或 'import'
  const [currentPage, setCurrentPage] = useState(initialPage)
  // 是否为从管理页触发的重新导入（区别于初始进入的首次导入）
  const [isReimport, setIsReimport] = useState(false)

  /**
   * 导航到配置页面
   */
  const navigateToConfig = useCallback(() => {
    setCurrentPage('config')
  }, [])

  /**
   * 导航到管理页面
   */
  const navigateToManage = useCallback(() => {
    setCurrentPage('manage')
  }, [])

  /**
   * 从管理页触发重新导入
   */
  const navigateToImport = useCallback(() => {
    setIsReimport(true)
    setCurrentPage('import')
  }, [])

  /**
   * 导入完成后切换到管理页，并通知 App
   */
  const handleImportComplete = useCallback(() => {
    setIsReimport(false)
    setCurrentPage('manage')
    if (onAfterImport) {
      onAfterImport()
    }
  }, [onAfterImport])

  return (
    <div className="skill-manager-module" style={styles.container}>
      {currentPage === 'manage' && (
        <ManagePage
          onNavigateToConfig={navigateToConfig}
          onReimport={navigateToImport}
          refreshSignal={refreshSignal}
        />
      )}
      {currentPage === 'config' && (
        <ConfigPage
          onBack={navigateToManage}
        />
      )}
      {currentPage === 'import' && (
        <ImportPage
          onImportComplete={handleImportComplete}
          isReimport={isReimport}
        />
      )}
    </div>
  )
}

// 样式定义
const styles = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
}
