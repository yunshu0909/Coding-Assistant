/**
 * BatchActionBar — 列表批量操作栏
 *
 * 负责：
 * - 展示当前选中数量
 * - 承载批量停用 / 推送操作
 *
 * @module components/BatchActionBar
 */

import React from 'react'
import Button from '../Button/Button'

/**
 * @param {object} props - 组件属性
 * @param {number} props.selectedCount - 选中的项目数量
 * @param {Function} props.onPush - 批量推送回调
 * @param {Function} props.onDeactivate - 批量停用回调
 * @param {boolean} props.isVisible - 是否显示
 * @returns {JSX.Element|null}
 */
export default function BatchActionBar({ selectedCount, onPush, onDeactivate, isVisible }) {
  if (!isVisible) return null

  return (
    <div className="batch-bar">
      <span className="batch-info">
        已选 <strong className="batch-count">{selectedCount}</strong> 个 skill
      </span>
      <div className="batch-actions">
        <Button variant="secondary" size="sm" onClick={onDeactivate}>停用</Button>
        <Button variant="primary" size="sm" onClick={onPush}>推送</Button>
      </div>
    </div>
  )
}
