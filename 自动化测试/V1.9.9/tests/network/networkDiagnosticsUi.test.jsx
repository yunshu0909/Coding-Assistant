/**
 * V1.9.9 网络诊断按需化 UI 与请求边界测试
 *
 * @module 自动化测试/V1.9.9/tests/network/networkDiagnosticsUi.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const hookMock = vi.hoisted(() => ({
  probeOnce: vi.fn(),
  toggle: vi.fn(),
  value: null,
}))

vi.mock('../../../../src/hooks/useIpMonitor', () => ({
  default: () => hookMock.value,
}))

import IpMonitorCard from '../../../../src/pages/network/IpMonitorCard'
import NetworkDiagnosticsPage from '../../../../src/pages/NetworkDiagnosticsPage'

function makeState(overrides = {}) {
  return {
    isEnabled: false,
    status: 'idle',
    currentIp: null,
    currentSource: null,
    previousIp: null,
    sampleCount: 0,
    uniqueIps: [],
    switchCount: 0,
    timeline: [],
    consecutiveFailCount: 0,
    successCount: 0,
    roundStartTime: null,
    lastCheckedAt: null,
    sampleIntervalMs: null,
    ...overrides,
  }
}

describe('V1.9.9 network diagnostics UI', () => {
  beforeEach(() => {
    hookMock.probeOnce.mockReset()
    hookMock.toggle.mockReset()
    hookMock.value = {
      state: makeState(),
      probing: false,
      probeOnce: hookMock.probeOnce,
      toggle: hookMock.toggle,
    }
    window.electronAPI = {
      probeEndpoints: vi.fn(),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete window.electronAPI
  })

  it('N-TC-08: idle 卡提供检测一次按钮与关闭的持续监控 Toggle', () => {
    render(<IpMonitorCard onToast={vi.fn()} />)

    expect(screen.getByRole('button', { name: '检测一次' })).toBeInTheDocument()
    expect(screen.getByText('持续监控')).toBeInTheDocument()
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('默认不会在后台查询公网 IP', { exact: false })).toBeInTheDocument()
  })

  it('N-TC-09: 单次失败态不会打开持续监控', () => {
    hookMock.value = {
      ...hookMock.value,
      state: makeState({
        status: 'failed',
        sampleCount: 1,
        consecutiveFailCount: 1,
        lastCheckedAt: Date.now(),
        timeline: [{ type: 'fail', ip: null, timestamp: Date.now() }],
      }),
    }
    render(<IpMonitorCard onToast={vi.fn()} />)

    expect(screen.getByText('无法获取')).toBeInTheDocument()
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('button', { name: '再次检测' })).toBeEnabled()
  })

  it('N-TC-10: 页面加载和 IP 操作不自动调用 API endpoint probe', () => {
    render(<NetworkDiagnosticsPage />)

    fireEvent.click(screen.getByRole('button', { name: '检测一次' }))
    fireEvent.click(screen.getByRole('switch'))

    expect(hookMock.probeOnce).toHaveBeenCalledTimes(1)
    expect(hookMock.toggle).toHaveBeenCalledWith(true)
    expect(window.electronAPI.probeEndpoints).not.toHaveBeenCalled()
  })
})
