/**
 * 通用远程配置加载器（主进程）
 *
 * 负责：
 * - 为所有"远程可更新"的 JSON 配置提供统一的加载 / 拉取 / 缓存机制
 * - 三层兜底：userData cache > 安装包打包版 > 硬编码 fallback
 * - 双源拉取：jsDelivr → GitHub Raw
 * - 后台刷新：启动后异步拉最新，写入 cache，下次启动生效
 *
 * 设计要点：
 * - loader 本身是纯机制，不包含任何 registry 特定的业务逻辑
 * - 每个使用者（model-registry / pricing / 未来的 codex / kimi）提供一个 spec
 * - spec 描述：name / remotePath / cacheFileName / packaged / hardcoded / validate
 * - 失败隔离：一个 registry 出问题不影响其他 registry
 *
 * @module electron/services/remoteConfigLoader
 */

const fs = require('fs/promises')
const path = require('path')

// 远端 URL 模板 —— 仓库根是 skill-manager/，remotePath 相对仓库根
// 双源按顺序尝试：jsDelivr 在前（国内海外兼顾），GitHub Raw 在后（稳定主备）
const REMOTE_SOURCE_TEMPLATES = [
  (remotePath) => `https://cdn.jsdelivr.net/gh/yunshu0909/CodePal@master/${remotePath}`,
  (remotePath) => `https://raw.githubusercontent.com/yunshu0909/CodePal/master/${remotePath}`,
]

const FETCH_TIMEOUT_MS = 5000

// 全局 registry 快照池：name → { config, source, spec }
// initRemoteConfig 注册后，getRemoteConfig 可同步读取
const registryStore = new Map()

/**
 * Schema 校验 + 非法时打印警告
 * @param {object} spec - registry spec
 * @param {unknown} data - 待校验数据
 * @param {string} originTag - 来源标识（用于日志）
 * @returns {object|null} 合法返回原对象，非法返回 null
 */
function validateOrWarn(spec, data, originTag) {
  const result = spec.validate(data)
  if (!result.valid) {
    console.warn(`[${spec.name}] ${originTag} invalid:`, result.error)
    return null
  }
  return data
}

/**
 * 读取打包进安装包的默认配置
 * @param {object} spec - registry spec
 * @returns {object|null}
 */
function loadPackaged(spec) {
  try {
    if (!spec.packaged) return null
    return validateOrWarn(spec, spec.packaged, 'packaged')
  } catch (error) {
    console.warn(`[${spec.name}] load packaged failed:`, error?.message || error)
    return null
  }
}

/**
 * 读取 userData 下的远程缓存文件
 * @param {object} spec - registry spec
 * @param {string} cacheFilePath - 缓存文件绝对路径
 * @returns {Promise<object|null>}
 */
async function loadCached(spec, cacheFilePath) {
  try {
    const content = await fs.readFile(cacheFilePath, 'utf-8')
    const parsed = JSON.parse(content)
    return validateOrWarn(spec, parsed, 'cached')
  } catch (error) {
    // cache 不存在是常态（首次启动），静默
    if (error.code !== 'ENOENT') {
      console.warn(`[${spec.name}] load cache failed:`, error?.message || error)
    }
    return null
  }
}

/**
 * 将远程拉到的配置写入 userData cache
 * @param {object} spec - registry spec
 * @param {string} cacheFilePath - 缓存文件绝对路径
 * @param {object} config - 已校验的配置对象
 * @returns {Promise<boolean>}
 */
async function saveCached(spec, cacheFilePath, config) {
  try {
    await fs.mkdir(path.dirname(cacheFilePath), { recursive: true })
    const content = `${JSON.stringify(config, null, 2)}\n`
    await fs.writeFile(cacheFilePath, content, 'utf-8')
    return true
  } catch (error) {
    console.warn(`[${spec.name}] save cache failed:`, error?.message || error)
    return false
  }
}

/**
 * 拉取单个 URL（带 5 秒超时）
 * @param {string} url - 完整 URL
 * @returns {Promise<object>} 解析后的 JSON
 */
async function fetchFromUrl(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'CodePal-Remote-Config-Fetch',
      },
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 从远程多源拉取：任意一源成功并通过校验即返回
 * @param {object} spec - registry spec
 * @returns {Promise<{success: boolean, config?: object, source?: string, error?: string}>}
 */
async function fetchRemote(spec) {
  for (const template of REMOTE_SOURCE_TEMPLATES) {
    const url = template(spec.remotePath)
    try {
      const data = await fetchFromUrl(url)
      const validated = validateOrWarn(spec, data, `remote from ${url}`)
      if (validated) {
        return { success: true, config: validated, source: url }
      }
      // schema 非法时继续下一源
    } catch (error) {
      console.warn(`[${spec.name}] fetch failed from ${url}:`, error?.message || error)
    }
  }
  return { success: false, error: 'ALL_REMOTE_SOURCES_FAILED' }
}

/**
 * 三层优先级加载：cache > packaged > hardcoded
 * @param {object} spec - registry spec
 * @param {string} cacheFilePath - 缓存文件绝对路径
 * @returns {Promise<{config: object, source: 'cache'|'packaged'|'hardcoded'}>}
 */
async function loadEffective(spec, cacheFilePath) {
  const cached = await loadCached(spec, cacheFilePath)
  if (cached) return { config: cached, source: 'cache' }

  const packaged = loadPackaged(spec)
  if (packaged) return { config: packaged, source: 'packaged' }

  // 硬编码兜底必须通过自身 schema 校验（单测会守住这点）
  return { config: { ...spec.hardcoded }, source: 'hardcoded' }
}

/**
 * 初始化一个 registry：加载到内存（供 IPC 同步读取）
 * @param {object} spec - registry spec
 * @param {{ getUserDataPath: () => string }} deps - 依赖注入
 * @returns {Promise<{ source: string, version: string }>}
 */
async function initRemoteConfig(spec, { getUserDataPath }) {
  const cacheFilePath = path.join(getUserDataPath(), spec.cacheFileName)
  const { config, source } = await loadEffective(spec, cacheFilePath)
  registryStore.set(spec.name, { config, source, spec })
  return { source, version: config?.version || 'unknown' }
}

/**
 * 同步读取某个 registry 的当前快照（供 IPC handler 用）
 * @param {string} name - registry 名称
 * @returns {{ config: object, source: string }}
 */
function getRemoteConfig(name) {
  const entry = registryStore.get(name)
  if (!entry) {
    // 极端情况：init 未跑完就被请求。主进程启动顺序应避免此情况
    console.warn(`[remote-config] "${name}" not initialized yet`)
    return { config: null, source: null }
  }
  return { config: entry.config, source: entry.source }
}

/**
 * 后台刷新某个 registry，拉成功即写入 cache（本次会话不切换，下次启动生效）
 * @param {object} spec - registry spec
 * @param {{ getUserDataPath: () => string }} deps
 * @returns {Promise<{ success: boolean, source?: string, version?: string, error?: string }>}
 */
async function refreshRemoteConfigInBackground(spec, { getUserDataPath }) {
  const result = await fetchRemote(spec)
  if (!result.success) {
    return { success: false, error: result.error }
  }

  const cacheFilePath = path.join(getUserDataPath(), spec.cacheFileName)
  const saved = await saveCached(spec, cacheFilePath, result.config)
  if (!saved) {
    return { success: false, error: 'CACHE_WRITE_FAILED' }
  }

  return {
    success: true,
    source: result.source,
    version: result.config?.version || 'unknown',
  }
}

/**
 * 测试辅助：清空所有已注册的 registry 快照
 * 仅在测试环境调用，生产代码不应使用
 */
function __resetAllRegistriesForTesting() {
  registryStore.clear()
}

module.exports = {
  initRemoteConfig,
  getRemoteConfig,
  refreshRemoteConfigInBackground,
  REMOTE_SOURCE_TEMPLATES,
  FETCH_TIMEOUT_MS,
  // 以下供单测使用
  loadEffective,
  loadCached,
  loadPackaged,
  saveCached,
  fetchRemote,
  validateOrWarn,
  __resetAllRegistriesForTesting,
}
