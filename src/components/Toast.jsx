/**
 * 提示消息组件
 *
 * 负责：
 * - 显示临时提示消息
 * - 自动消失动画
 *
 * @module Toast
 */

import React, { useEffect, useState } from 'react'

/**
 * Toast 提示组件
 * @param {Object} props - 组件属性
 * @param {string} props.message - 提示消息内容
 * @param {Function} props.onClose - 关闭回调
 * @returns {JSX.Element} Toast 提示
 */
export default function Toast({ message, onClose }) {
  // 控制显示/隐藏动画状态
  const [show, setShow] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setShow(true))
    const timer = setTimeout(() => {
      setShow(false)
      setTimeout(onClose, 300)
    }, 2000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className={`toast ${show ? 'show' : ''}`}>
      {message}
    </div>
  )
}
