/**
 * V0.6 用量监测模块契约单元测试
 *
 * 负责：
 * - 校验 V0.6 页面基础结构已从占位态升级为功能态
 * - 锁定周期切换、核心指标与明细表头的可见契约
 *
 * @module 自动化测试/V0.6/tests/unit/components/UsageMonitorModule.v06.contract.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import UsageMonitorModule from '@/components/UsageMonitorModule.jsx'

describe('UsageMonitorModule V0.6 Contract (Unit)', () => {
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

  it('UT-01: 应展示三个周期入口', () => {
    act(() => {
      root.render(<UsageMonitorModule />)
    })

    expect(container.textContent).toContain('今日')
    expect(container.textContent).toContain('近7天')
    expect(container.textContent).toContain('近30天')
  })

  it('UT-02: 应展示核心指标卡标签', () => {
    act(() => {
      root.render(<UsageMonitorModule />)
    })

    expect(container.textContent).toContain('总 Token')
    expect(container.textContent).toContain('输入')
    expect(container.textContent).toContain('输出')
    expect(container.textContent).toContain('缓存命中')
  })

  it('UT-03: 应展示模型用量明细表头', () => {
    act(() => {
      root.render(<UsageMonitorModule />)
    })

    expect(container.textContent).toContain('模型用量明细')
    expect(container.textContent).toContain('模型')
    expect(container.textContent).toContain('总 Token')
  })

  it('UT-04: V0.6 不应再展示占位文案', () => {
    act(() => {
      root.render(<UsageMonitorModule />)
    })

    expect(container.textContent).not.toContain('当前版本为模块占位')
  })
})
