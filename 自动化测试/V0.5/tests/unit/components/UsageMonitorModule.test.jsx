import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import UsageMonitorModule from '@/components/UsageMonitorModule.jsx'

describe('UsageMonitorModule (V0.5)', () => {
  let container
  let root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('渲染用量监测占位页', () => {
    act(() => {
      root.render(<UsageMonitorModule />)
    })

    expect(container.textContent).toContain('用量监测')
    expect(container.textContent).toContain('当前版本为模块占位')
    expect(container.textContent).toContain('指标卡片占位')
  })
})
