/**
 * 复选框组件
 *
 * 负责：
 * - 显示选中/未选中/半选状态
 * - 提供统一的视觉样式
 *
 * @module Checkbox
 */

import React from 'react'

const checkSvg = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const indeterminateSvg = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M2.5 6H9.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

/**
 * 复选框组件
 * @param {Object} props - 组件属性
 * @param {boolean} props.checked - 是否选中
 * @param {boolean} [props.indeterminate=false] - 是否半选状态
 * @returns {JSX.Element} 复选框
 */
export default function Checkbox({ checked, indeterminate = false }) {
  const isChecked = checked || indeterminate
  return (
    <div className={`checkbox ${isChecked ? 'checked' : ''}`} style={{ marginRight: '14px' }}>
      {indeterminate ? indeterminateSvg : checked ? checkSvg : null}
    </div>
  )
}
