/**
 * 模型注册表服务（兼容门面，已迁移到 remoteConfigLoader）
 *
 * 本文件保留的目的：
 * - 对外保持旧 API（initModelRegistry / getEffectiveRegistry / refreshRegistryInBackground）
 * - 已有调用方（如 main.js、测试）不用改动
 * - 内部全部委托给 remoteConfigLoader + modelRegistry spec
 *
 * 新增场景请直接使用 remoteConfigLoader，不要再扩展本文件。
 *
 * @module electron/services/modelRegistryService
 */

const {
  initRemoteConfig,
  getRemoteConfig,
  refreshRemoteConfigInBackground,
} = require('./remoteConfigLoader')
const {
  modelRegistrySpec,
  HARDCODED_MODEL_FALLBACK,
  validateModelRegistry,
} = require('./registries/modelRegistry')

/**
 * 初始化 model-registry（加载到内存，供 IPC 使用）
 * @param {{ getUserDataPath: () => string }} deps
 * @returns {Promise<{ source: string, version: string }>}
 */
async function initModelRegistry(deps) {
  return initRemoteConfig(modelRegistrySpec, deps)
}

/**
 * 同步获取当前 model-registry 快照
 * @returns {{ registry: object|null, source: string|null }}
 */
function getEffectiveRegistry() {
  const { config, source } = getRemoteConfig('model-registry')
  // 兼容旧 API 字段名：registry 而非 config
  return { registry: config, source }
}

/**
 * 后台刷新 model-registry（从远程拉取，写入 cache）
 * @param {{ getUserDataPath: () => string }} deps
 * @returns {Promise<object>}
 */
async function refreshRegistryInBackground(deps) {
  return refreshRemoteConfigInBackground(modelRegistrySpec, deps)
}

module.exports = {
  initModelRegistry,
  getEffectiveRegistry,
  refreshRegistryInBackground,
  // 兼容旧测试导出
  validateRegistry: validateModelRegistry,
  HARDCODED_FALLBACK_REGISTRY: HARDCODED_MODEL_FALLBACK,
}
