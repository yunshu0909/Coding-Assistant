/**
 * V1.9.9 网络诊断按需化 service 生命周期测试
 *
 * @module 自动化测试/V1.9.9/tests/network/networkDiagnosticsLifecycle.test
 */

import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, afterEach } from 'vitest'

const require = createRequire(import.meta.url)
const {
  createNetworkDiagnosticsService,
  CONTINUOUS_MONITORING_STORE_KEY,
  BACKGROUND_INTERVAL_MS,
  FOREGROUND_INTERVAL_MS,
} = require('../../../../electron/services/networkDiagnosticsService')

function createScheduler() {
  let nextId = 1
  const active = new Map()
  return {
    active,
    setIntervalFn: vi.fn((callback, intervalMs) => {
      const id = nextId++
      active.set(id, { callback, intervalMs })
      return id
    }),
    clearIntervalFn: vi.fn((id) => active.delete(id)),
  }
}

function createStore(value) {
  return {
    get: vi.fn(() => value),
    set: vi.fn(),
  }
}

function createPersistentStore(initialValue) {
  const values = new Map([[CONTINUOUS_MONITORING_STORE_KEY, initialValue]])
  return {
    get: vi.fn((key, fallback) => values.has(key) ? values.get(key) : fallback),
    set: vi.fn((key, value) => values.set(key, value)),
  }
}

function createProbe(result = { success: true, ip: '203.0.113.7', source: 'ipify' }) {
  return vi.fn().mockResolvedValue(result)
}

async function flushSample(service, expectedIp = '203.0.113.7') {
  await vi.waitFor(() => expect(service.getState().currentIp).toBe(expectedIp))
}

describe('V1.9.9 network diagnostics lifecycle', () => {
  const services = []

  afterEach(() => {
    for (const service of services.splice(0)) service.dispose()
    vi.restoreAllMocks()
  })

  function makeService({ store = createStore(false), probe = createProbe(), scheduler = createScheduler() } = {}) {
    const service = createNetworkDiagnosticsService({
      store,
      probePublicIpFn: probe,
      setIntervalFn: scheduler.setIntervalFn,
      clearIntervalFn: scheduler.clearIntervalFn,
      nowFn: () => Date.parse('2026-07-12T12:00:00+08:00'),
    })
    services.push(service)
    return { service, store, probe, scheduler }
  }

  it('N-TC-01: 无偏好时初始化零请求零 timer', () => {
    const { service, probe, scheduler } = makeService({ store: createStore(undefined) })
    const state = service.initialize()

    expect(state.isEnabled).toBe(false)
    expect(state.status).toBe('idle')
    expect(probe).not.toHaveBeenCalled()
    expect(scheduler.active.size).toBe(0)
  })

  it('N-TC-01b: 主进程启动只调用按偏好初始化接线', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'electron/main.js'), 'utf8')
    expect(source).toContain('initializeIpMonitor({ store, getWindow: () => mainWindow })')
    expect(source).not.toMatch(/\b(startIpMonitor|probeIpOnce|probeAllEndpoints)\s*\(/)
  })

  it('N-TC-02: 偏好读取失败时安全保持关闭', () => {
    const store = { get: vi.fn(() => { throw new Error('READ_FAILED') }), set: vi.fn() }
    const { service, probe, scheduler } = makeService({ store })
    const state = service.initialize()

    expect(state.isEnabled).toBe(false)
    expect(probe).not.toHaveBeenCalled()
    expect(scheduler.active.size).toBe(0)
  })

  it('N-TC-03: 单次检测只探测一次且不创建 timer', async () => {
    const { service, probe, scheduler } = makeService()
    service.initialize()

    const state = await service.probeIpOnce()

    expect(probe).toHaveBeenCalledTimes(1)
    expect(state.currentIp).toBe('203.0.113.7')
    expect(state.isEnabled).toBe(false)
    expect(scheduler.active.size).toBe(0)
  })

  it('N-TC-03b: 单次检测失败也不创建 timer', async () => {
    const probe = createProbe({ success: false, ip: null, source: null, error: 'REQUEST_TIMEOUT_6000MS' })
    const { service, scheduler } = makeService({ probe })
    service.initialize()

    const state = await service.probeIpOnce()

    expect(probe).toHaveBeenCalledTimes(1)
    expect(state.status).toBe('failed')
    expect(state.isEnabled).toBe(false)
    expect(scheduler.active.size).toBe(0)
  })

  it('N-TC-04: 前台开启持续监控会持久化、首采样并建 5 秒 timer', async () => {
    const { service, store, probe, scheduler } = makeService()
    service.initialize()
    service.setForeground(true)
    service.setContinuousMonitoring(true)
    await flushSample(service)

    expect(store.set).toHaveBeenCalledWith(CONTINUOUS_MONITORING_STORE_KEY, true)
    expect(probe).toHaveBeenCalledTimes(1)
    expect([...scheduler.active.values()].map((item) => item.intervalMs)).toEqual([FOREGROUND_INTERVAL_MS])
  })

  it('N-TC-05: 页面离开后唯一 timer 降为 60 秒', async () => {
    const { service, scheduler } = makeService()
    service.initialize()
    service.setForeground(true)
    service.setContinuousMonitoring(true)
    await flushSample(service)

    service.setForeground(false)

    expect(scheduler.active.size).toBe(1)
    expect([...scheduler.active.values()][0].intervalMs).toBe(BACKGROUND_INTERVAL_MS)
    expect(service.getState().sampleIntervalMs).toBe(60000)
  })

  it('N-TC-05b: 返回页面后唯一 timer 恢复为 5 秒', async () => {
    const { service, scheduler } = makeService()
    service.initialize()
    service.setContinuousMonitoring(true)
    await flushSample(service)
    service.setForeground(false)

    service.setForeground(true)

    expect(scheduler.active.size).toBe(1)
    expect([...scheduler.active.values()][0].intervalMs).toBe(FOREGROUND_INTERVAL_MS)
  })

  it('N-TC-05c: interval callback 到期会继续真实采样', async () => {
    const { service, probe, scheduler } = makeService()
    service.initialize()
    service.setContinuousMonitoring(true)
    await flushSample(service)
    const timer = [...scheduler.active.values()][0]

    timer.callback()
    await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(2))
    expect(service.getState().sampleCount).toBe(2)
  })

  it('N-TC-06: 关闭持续监控会清 timer、持久化 false 并保留结果', async () => {
    const { service, store, scheduler } = makeService()
    service.initialize()
    service.setContinuousMonitoring(true)
    await flushSample(service)

    const state = service.setContinuousMonitoring(false)

    expect(store.set).toHaveBeenLastCalledWith(CONTINUOUS_MONITORING_STORE_KEY, false)
    expect(scheduler.active.size).toBe(0)
    expect(state.currentIp).toBe('203.0.113.7')
    expect(state.status).toBe('off')
    expect(state.sampleCount).toBe(1)
    expect(state.uniqueIps).toEqual(['203.0.113.7'])
    expect(state.switchCount).toBe(0)
    expect(state.timeline).toHaveLength(1)
    expect(state.lastCheckedAt).toBe(Date.parse('2026-07-12T12:00:00+08:00'))
  })

  it('N-TC-07: 初始化只在持久化值严格为 true 时恢复', async () => {
    const trueGroup = makeService({ store: createStore(true) })
    const falseGroup = makeService({ store: createStore(false) })
    const emptyGroup = makeService({ store: createStore(undefined) })

    trueGroup.service.initialize()
    falseGroup.service.initialize()
    emptyGroup.service.initialize()
    await flushSample(trueGroup.service)

    expect(trueGroup.probe).toHaveBeenCalledTimes(1)
    expect([...trueGroup.scheduler.active.values()][0].intervalMs).toBe(60000)
    expect(falseGroup.probe).not.toHaveBeenCalled()
    expect(falseGroup.scheduler.active.size).toBe(0)
    expect(emptyGroup.probe).not.toHaveBeenCalled()
    expect(emptyGroup.scheduler.active.size).toBe(0)
  })

  it('N-TC-07b: 共享持久化 store 在新实例中恢复开启与关闭', async () => {
    const store = createPersistentStore(false)
    const first = makeService({ store })
    first.service.initialize()
    first.service.setContinuousMonitoring(true)
    await flushSample(first.service)
    first.service.dispose()

    const restoredOn = makeService({ store })
    restoredOn.service.initialize()
    await flushSample(restoredOn.service)
    expect(restoredOn.service.getState().isEnabled).toBe(true)
    expect(restoredOn.scheduler.active.size).toBe(1)

    restoredOn.service.setContinuousMonitoring(false)
    restoredOn.service.dispose()
    const restoredOff = makeService({ store })
    const offState = restoredOff.service.initialize()
    expect(offState.isEnabled).toBe(false)
    expect(restoredOff.probe).not.toHaveBeenCalled()
    expect(restoredOff.scheduler.active.size).toBe(0)
  })
})
