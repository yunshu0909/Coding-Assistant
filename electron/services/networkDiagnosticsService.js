/**
 * 网络诊断服务
 *
 * 负责：
 * - 获取公网 IPv4（双源降级：ipify → icanhazip）
 * - DNS 解析测速
 * - TLS 握手测速
 * - HTTP 可达性检测
 * - 端点三段式完整探测（DNS → TLS → HTTP）
 *
 * 从 scripts/network/runVpnDiagnosticsDemo.js 提取核心函数，
 * 去除 CLI 相关逻辑，供 IPC Handler 调用。
 *
 * @module electron/services/networkDiagnosticsService
 */

const dns = require('dns').promises
const https = require('https')
const tls = require('tls')
const { performance } = require('perf_hooks')

const REQUEST_TIMEOUT_MS = 6000

/**
 * 公网 IP 查询源配置
 * 按优先级排列，前者失败时自动降级到后者
 */
const IP_SOURCES = [
  {
    name: 'ipify',
    url: 'https://api.ipify.org?format=json',
    parseResponseBody(body) {
      const parsed = JSON.parse(body)
      return normalizeIpValue(parsed.ip)
    },
  },
  {
    name: 'icanhazip',
    url: 'https://ipv4.icanhazip.com',
    parseResponseBody(body) {
      return normalizeIpValue(body)
    },
  },
]

/**
 * API 端点探测配置
 * expectedStatuses 中的状态码均视为"可达"（握手成功，不验证凭证）
 */
const ENDPOINT_PROBES = [
  {
    id: 'openai-api',
    label: 'OpenAI',
    host: 'api.openai.com',
    method: 'GET',
    path: '/v1/models',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'CodePal-Network-Diagnostics/1.0',
    },
    expectedStatuses: new Set([200, 401, 403]),
  },
  {
    id: 'anthropic-api',
    label: 'Anthropic',
    host: 'api.anthropic.com',
    method: 'HEAD',
    path: '/v1/messages',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'CodePal-Network-Diagnostics/1.0',
    },
    expectedStatuses: new Set([200, 401, 403, 405]),
  },
]

/**
 * 规范化公网 IP 文本
 * @param {string} value
 * @returns {string}
 */
function normalizeIpValue(value) {
  return String(value || '').trim()
}

/**
 * 发起 HTTPS 请求并返回完整响应
 * @param {Object} options
 * @param {string} options.url
 * @param {string} [options.method='GET']
 * @param {Record<string, string>} [options.headers={}]
 * @param {number} [options.timeoutMs=REQUEST_TIMEOUT_MS]
 * @returns {Promise<{statusCode: number|null, body: string, durationMs: number}>}
 */
function requestText({ url, method = 'GET', headers = {}, timeoutMs = REQUEST_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now()
    const request = https.request(url, { method, headers }, (response) => {
      const chunks = []
      response.setEncoding('utf8')
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode || null,
          body: chunks.join(''),
          durationMs: performance.now() - startedAt,
        })
      })
    })

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`REQUEST_TIMEOUT_${timeoutMs}MS`))
    })

    request.on('error', (error) => reject(error))
    request.end()
  })
}

/**
 * 获取当前公网 IPv4
 * @returns {Promise<{success: boolean, ip: string|null, source: string|null, durationMs: number|null, error: string|null}>}
 */
async function probePublicIp() {
  for (const source of IP_SOURCES) {
    const startedAt = performance.now()
    try {
      const response = await requestText({
        url: source.url,
        headers: {
          Accept: 'application/json, text/plain;q=0.9',
          'User-Agent': 'CodePal-Network-Diagnostics/1.0',
        },
      })
      const ip = source.parseResponseBody(response.body)
      if (ip) {
        return { success: true, ip, source: source.name, durationMs: performance.now() - startedAt, error: null }
      }
    } catch (error) {
      // 最后一个源也失败时返回错误
      if (source === IP_SOURCES[IP_SOURCES.length - 1]) {
        return { success: false, ip: null, source: source.name, durationMs: performance.now() - startedAt, error: error.message }
      }
    }
  }
  return { success: false, ip: null, source: null, durationMs: null, error: 'NO_IP_SOURCE_AVAILABLE' }
}

/**
 * 测量 DNS 查询耗时
 * @param {string} host
 * @returns {Promise<{success: boolean, address: string|null, family: number|null, durationMs: number|null, error: string|null}>}
 */
async function probeDns(host) {
  const startedAt = performance.now()
  try {
    const result = await dns.lookup(host)
    return { success: true, address: result.address, family: result.family, durationMs: performance.now() - startedAt, error: null }
  } catch (error) {
    return { success: false, address: null, family: null, durationMs: performance.now() - startedAt, error: error.message }
  }
}

/**
 * 测量 TLS 握手耗时
 * @param {string} host
 * @param {number} [port=443]
 * @returns {Promise<{success: boolean, protocol: string|null, cipher: string|null, durationMs: number|null, error: string|null}>}
 */
function probeTls(host, port = 443) {
  return new Promise((resolve) => {
    const startedAt = performance.now()
    let settled = false
    const socket = tls.connect({ host, port, servername: host, timeout: REQUEST_TIMEOUT_MS, rejectUnauthorized: true })

    const finish = (result) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(result)
    }

    socket.on('secureConnect', () => {
      finish({ success: true, protocol: socket.getProtocol() || null, cipher: socket.getCipher()?.name || null, durationMs: performance.now() - startedAt, error: null })
    })
    socket.on('timeout', () => {
      finish({ success: false, protocol: null, cipher: null, durationMs: performance.now() - startedAt, error: `TLS_TIMEOUT_${REQUEST_TIMEOUT_MS}MS` })
    })
    socket.on('error', (error) => {
      finish({ success: false, protocol: null, cipher: null, durationMs: performance.now() - startedAt, error: error.message })
    })
  })
}

/**
 * 测量 API 端点 HTTP 可达性
 * @param {Object} probe - 端点配置
 * @returns {Promise<{success: boolean, statusCode: number|null, durationMs: number|null, error: string|null}>}
 */
async function probeHttp(probe) {
  try {
    const response = await requestText({
      url: `https://${probe.host}${probe.path}`,
      method: probe.method,
      headers: probe.headers,
    })
    return {
      success: response.statusCode !== null && probe.expectedStatuses.has(response.statusCode),
      statusCode: response.statusCode,
      durationMs: response.durationMs,
      error: null,
    }
  } catch (error) {
    return { success: false, statusCode: null, durationMs: null, error: error.message }
  }
}

/**
 * 执行单个端点的三段式探测（DNS → TLS → HTTP）
 * @param {Object} probe - 端点配置
 * @returns {Promise<{id: string, label: string, host: string, dns: Object, tls: Object, http: Object, reachable: boolean}>}
 */
async function probeEndpoint(probe) {
  const failStub = { success: false, durationMs: null, error: null }
  const dnsResult = await probeDns(probe.host)

  // DNS 失败时短路，不浪费时间执行后续探测
  if (!dnsResult.success) {
    return {
      id: probe.id, label: probe.label, host: probe.host,
      dns: dnsResult,
      tls: { ...failStub, protocol: null, cipher: null },
      http: { ...failStub, statusCode: null },
      reachable: false,
    }
  }

  const tlsResult = await probeTls(probe.host)

  // TLS 失败时短路
  if (!tlsResult.success) {
    return {
      id: probe.id, label: probe.label, host: probe.host,
      dns: dnsResult, tls: tlsResult,
      http: { ...failStub, statusCode: null },
      reachable: false,
    }
  }

  const httpResult = await probeHttp(probe)

  return {
    id: probe.id, label: probe.label, host: probe.host,
    dns: dnsResult, tls: tlsResult, http: httpResult,
    reachable: httpResult.success,
  }
}

/**
 * 并行检测所有配置的 API 端点
 * @returns {Promise<Array<{id, label, host, dns, tls, http, reachable}>>}
 */
async function probeAllEndpoints() {
  return Promise.all(ENDPOINT_PROBES.map((probe) => probeEndpoint(probe)))
}

/* ============================================================
   公网 IP 按需检测 / 用户授权的持续监控
   默认零请求；只有持久化开关严格为 true 时才在启动后恢复。
   ============================================================ */

const CONTINUOUS_MONITORING_STORE_KEY = 'networkDiagnostics.continuousMonitoring'
const BACKGROUND_INTERVAL_MS = 60000  // 页面关闭后 60 秒
const FOREGROUND_INTERVAL_MS = 5000   // 页面打开时 5 秒
const MAX_TIMELINE_POINTS = 30
const ROUND_DURATION_MS = 30 * 60 * 1000

/**
 * 创建空闲初始状态
 * @returns {object}
 */
function createInitialState() {
  return {
    isEnabled: false,
    status: 'idle',  // idle | detecting | stable | switched | failed | off
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
  }
}

/**
 * 创建可注入依赖的网络诊断实例
 * @param {object} [deps]
 * @param {() => Promise<object>} [deps.probePublicIpFn] - 公网 IP 探测函数
 * @param {{get?: Function, set?: Function}|null} [deps.store] - electron-store 实例
 * @param {() => import('electron').BrowserWindow|null} [deps.getWindow] - 获取主窗口
 * @param {Function} [deps.setIntervalFn] - 定时器注入
 * @param {Function} [deps.clearIntervalFn] - 清理定时器注入
 * @param {() => number} [deps.nowFn] - 当前时间注入
 * @returns {object}
 */
function createNetworkDiagnosticsService({
  probePublicIpFn = probePublicIp,
  store = null,
  getWindow = () => null,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  nowFn = Date.now,
} = {}) {
  let monitorState = createInitialState()
  let intervalId = null
  let isForeground = false
  let samplePromise = null

  /** 返回不可变快照，避免 renderer/测试改坏服务内部数组 */
  function getState() {
    return {
      ...monitorState,
      uniqueIps: [...monitorState.uniqueIps],
      timeline: monitorState.timeline.map((point) => ({ ...point })),
    }
  }

  /** 将当前快照推给 renderer；窗口不可用时不影响服务 */
  function emitState() {
    try {
      const mainWindow = getWindow?.()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('network:ipStateUpdate', getState())
      }
    } catch {
      // 窗口不可用时静默，后台监控继续
    }
  }

  /** 清理现有 interval，并同步公开的当前频率 */
  function clearSchedule() {
    if (intervalId !== null) {
      clearIntervalFn(intervalId)
      intervalId = null
    }
    monitorState.sampleIntervalMs = null
  }

  /** 仅在用户已开启持续监控时建立唯一 interval */
  function restartSchedule() {
    clearSchedule()
    if (!monitorState.isEnabled) return

    const intervalMs = isForeground ? FOREGROUND_INTERVAL_MS : BACKGROUND_INTERVAL_MS
    monitorState.sampleIntervalMs = intervalMs
    intervalId = setIntervalFn(() => {
      runSample({ allowWhenDisabled: false }).catch(() => {})
    }, intervalMs)
  }

  /**
   * 处理一次采样结果
   * @param {{success: boolean, ip: string|null, source: string|null}} result
   */
  function handleSampleResult(result) {
    const now = nowFn()
    if (monitorState.roundStartTime && now - monitorState.roundStartTime >= ROUND_DURATION_MS) {
      monitorState.sampleCount = 0
      monitorState.switchCount = 0
      monitorState.uniqueIps = monitorState.currentIp ? [monitorState.currentIp] : []
      monitorState.timeline = []
      monitorState.consecutiveFailCount = 0
      monitorState.successCount = 0
      monitorState.roundStartTime = now
    }

    monitorState.lastCheckedAt = now

    if (result.success && result.ip) {
      const isFirstSample = monitorState.currentIp === null
      const isSwitched = !isFirstSample && result.ip !== monitorState.currentIp

      if (!monitorState.uniqueIps.includes(result.ip)) {
        monitorState.uniqueIps.push(result.ip)
      }

      monitorState.previousIp = isFirstSample ? null : monitorState.currentIp
      monitorState.currentIp = result.ip
      monitorState.currentSource = result.source
      monitorState.sampleCount += 1
      monitorState.successCount += 1
      monitorState.consecutiveFailCount = 0
      monitorState.switchCount += isSwitched ? 1 : 0
      monitorState.status = isSwitched ? 'switched' : 'stable'
      monitorState.timeline.push({ type: isSwitched ? 'switch' : 'stable', ip: result.ip, timestamp: now })
      if (!monitorState.roundStartTime) monitorState.roundStartTime = now
    } else {
      monitorState.sampleCount += 1
      monitorState.consecutiveFailCount += 1
      monitorState.status = 'failed'
      monitorState.timeline.push({ type: 'fail', ip: null, timestamp: now })
      if (!monitorState.roundStartTime) monitorState.roundStartTime = now
    }

    if (monitorState.timeline.length > MAX_TIMELINE_POINTS) {
      monitorState.timeline = monitorState.timeline.slice(-MAX_TIMELINE_POINTS)
    }
  }

  /**
   * 执行一次采样；同一时刻只允许一个请求在飞
   * @param {{allowWhenDisabled: boolean}} options
   * @returns {Promise<object>}
   */
  async function runSample({ allowWhenDisabled }) {
    if (!monitorState.isEnabled && !allowWhenDisabled) return getState()
    if (samplePromise) return samplePromise

    const startedWhileEnabled = monitorState.isEnabled
    monitorState.status = 'detecting'
    emitState()

    samplePromise = (async () => {
      let result
      try {
        result = await probePublicIpFn()
      } catch (error) {
        result = { success: false, ip: null, source: null, error: error?.message || 'IP_PROBE_FAILED' }
      }
      handleSampleResult(result)

      // 不论是 interval 还是用户手动单次检测，只要请求发出时开关为开、
      // 完成前被关闭，结果可保留，但状态不能从 off 反弹为 stable/failed。
      if (startedWhileEnabled && !monitorState.isEnabled) {
        monitorState.status = monitorState.currentIp || monitorState.sampleCount > 0 ? 'off' : 'idle'
      }
      emitState()
      return getState()
    })()

    try {
      return await samplePromise
    } finally {
      samplePromise = null
    }
  }

  /** 根据持久化选择初始化；默认或读取失败均为关闭 */
  function initialize() {
    let shouldResume = false
    try {
      shouldResume = store?.get?.(CONTINUOUS_MONITORING_STORE_KEY, false) === true
    } catch {
      shouldResume = false
    }

    monitorState = createInitialState()
    monitorState.isEnabled = shouldResume
    monitorState.status = shouldResume ? 'detecting' : 'idle'

    if (shouldResume) {
      runSample({ allowWhenDisabled: false }).catch(() => {})
      restartSchedule()
    }
    emitState()
    return getState()
  }

  /** 单次检测：无论持续监控是否开启，都只复用本次请求，不创建新 timer */
  function probeIpOnce() {
    return runSample({ allowWhenDisabled: true })
  }

  /** 页面打开/关闭只改变已开启持续监控的频率，绝不改变开关 */
  function setForeground(foreground) {
    const nextForeground = Boolean(foreground)
    if (nextForeground !== isForeground) {
      isForeground = nextForeground
      restartSchedule()
      emitState()
    }
    return getState()
  }

  /** 用户明确开启/关闭持续监控，并同步持久化 */
  function setContinuousMonitoring(enabled) {
    const nextEnabled = Boolean(enabled)
    try {
      store?.set?.(CONTINUOUS_MONITORING_STORE_KEY, nextEnabled)
    } catch (error) {
      const persistError = new Error(error?.message || 'PREFERENCE_WRITE_FAILED')
      persistError.code = 'PREFERENCE_WRITE_FAILED'
      throw persistError
    }

    monitorState.isEnabled = nextEnabled
    if (nextEnabled) {
      monitorState.status = 'detecting'
      runSample({ allowWhenDisabled: false }).catch(() => {})
      restartSchedule()
    } else {
      clearSchedule()
      monitorState.status = monitorState.currentIp || monitorState.sampleCount > 0 ? 'off' : 'idle'
      emitState()
    }
    return getState()
  }

  /** 释放 interval，供应用退出和测试清理 */
  function dispose() {
    clearSchedule()
  }

  return {
    initialize,
    getState,
    probeIpOnce,
    setForeground,
    setContinuousMonitoring,
    dispose,
  }
}

/** 默认实例：由 main 注入 electron-store 与窗口引用 */
let defaultIpService = createNetworkDiagnosticsService()

function initializeIpMonitor({ store, getWindow }) {
  defaultIpService.dispose()
  defaultIpService = createNetworkDiagnosticsService({ store, getWindow })
  return defaultIpService.initialize()
}

function getIpMonitorState() {
  return defaultIpService.getState()
}

function probeIpOnce() {
  return defaultIpService.probeIpOnce()
}

function setIpMonitorFastMode(fast) {
  return defaultIpService.setForeground(fast)
}

function toggleIpMonitor(enabled) {
  return defaultIpService.setContinuousMonitoring(enabled)
}

module.exports = {
  probePublicIp,
  probeAllEndpoints,
  createNetworkDiagnosticsService,
  initializeIpMonitor,
  getIpMonitorState,
  probeIpOnce,
  setIpMonitorFastMode,
  toggleIpMonitor,
  CONTINUOUS_MONITORING_STORE_KEY,
  BACKGROUND_INTERVAL_MS,
  FOREGROUND_INTERVAL_MS,
  REQUEST_TIMEOUT_MS,
  ENDPOINT_PROBES,
}
