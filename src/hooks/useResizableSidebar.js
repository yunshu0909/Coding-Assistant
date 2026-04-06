/**
 * 可拖拽调整侧边栏宽度的 hook
 *
 * 使用方式：
 * ```jsx
 * const { sidebarWidth, resizerProps } = useResizableSidebar(280, 200, 500)
 * <div style={{ width: sidebarWidth }}>...</div>
 * <div {...resizerProps} />
 * ```
 *
 * @module hooks/useResizableSidebar
 */

import { useState, useCallback, useRef, useEffect } from 'react'

/**
 * @param {number} defaultWidth - 默认宽度
 * @param {number} minWidth - 最小宽度
 * @param {number} maxWidth - 最大宽度
 * @returns {{ sidebarWidth: number, resizerProps: object }}
 */
export default function useResizableSidebar(defaultWidth = 280, minWidth = 200, maxWidth = 500) {
  const [width, setWidth] = useState(defaultWidth)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const handleMouseDown = useCallback((e) => {
    isDragging.current = true
    startX.current = e.clientX
    startWidth.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  }, [width])

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current) return
      const delta = e.clientX - startX.current
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth.current + delta))
      setWidth(newWidth)
    }

    const handleMouseUp = () => {
      if (!isDragging.current) return
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [minWidth, maxWidth])

  return {
    sidebarWidth: width,
    resizerProps: {
      className: 'resize-handle',
      onMouseDown: handleMouseDown,
    },
  }
}
