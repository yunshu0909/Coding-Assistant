/**
 * 终端外观服务
 *
 * 负责：
 * - 读取 ~/Library/Preferences/com.apple.Terminal.plist 获取当前默认主题名
 * - 如需要则导入打包内置的 .terminal 主题到系统主题库
 * - 写 "Default Window Settings" + "Startup Window Settings" + `killall cfprefsd`
 * - 恢复系统默认为 Clear Dark
 *
 * 技术限制（V1 不处理）：
 * - Terminal.app 对已打开的窗口不重绘背景色；所以 `setDefault` 成功后
 *   当前窗口不会变，只有新开的窗口生效。UI 侧以文案告知用户。
 *
 * @module electron/services/terminalThemeService
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const childProcess = require('child_process')
const { promisify } = require('util')

const defaultExecFile = promisify(childProcess.execFile)

// 可注入（测试用）
let _homeDir = os.homedir()
let _resourcesDir = null
let _execFile = defaultExecFile

/**
 * Terminal plist 文件路径
 */
function getPlistPath() {
  return path.join(_homeDir, 'Library', 'Preferences', 'com.apple.Terminal.plist')
}

/**
 * 打包内置主题资源目录
 * 开发环境：electron/resources/terminal-themes（源码目录）
 * 生产环境：process.resourcesPath/terminal-themes（electron-builder 的 extraResources 配置）
 *
 * 判断方式：优先用源码目录，存在则是 dev；否则 fallback 到生产路径。
 * 不能用 `process.resourcesPath.includes('.app')` — dev 下 Electron 二进制路径里也有 .app。
 */
function getResourcesDir() {
  if (_resourcesDir) return _resourcesDir
  const devPath = path.join(__dirname, '..', 'resources', 'terminal-themes')
  if (fs.existsSync(path.join(devPath, 'themes-meta.json'))) {
    return devPath
  }
  return path.join(process.resourcesPath || '', 'terminal-themes')
}

// ---------- themes-meta 加载（模块级缓存） ----------

let _themesMetaCache = null

/**
 * 读 themes-meta.json
 * @returns {Array<object>} 6 套主题的元数据
 */
function loadThemesMeta() {
  if (_themesMetaCache) return _themesMetaCache
  const metaPath = path.join(getResourcesDir(), 'themes-meta.json')
  const raw = fs.readFileSync(metaPath, 'utf8')
  _themesMetaCache = JSON.parse(raw).themes
  return _themesMetaCache
}

// ---------- 核心接口 ----------

/**
 * 列出 6 套内置主题 + 系统当前默认主题名
 * @returns {Promise<{ themes: object[], currentDefault: string | null }>}
 */
async function listThemes() {
  const themes = loadThemesMeta().map((t) => ({
    ...t,
    filePath: path.join(getResourcesDir(), t.filename),
  }))
  const currentDefault = await readCurrentDefault()
  return { themes, currentDefault }
}

/**
 * 读系统当前默认主题名（Default Window Settings）
 * @returns {Promise<string | null>}
 */
async function readCurrentDefault() {
  try {
    const { stdout } = await _execFile('defaults', [
      'read', 'com.apple.Terminal', 'Default Window Settings',
    ])
    return (stdout || '').trim() || null
  } catch {
    // plist 尚未初始化 / 读取失败
    return null
  }
}

/**
 * 读取系统 Window Settings 的全部 key
 * @returns {Promise<string[]>}
 */
async function readInstalledThemeKeys() {
  try {
    const { stdout } = await _execFile('defaults', [
      'read', 'com.apple.Terminal', 'Window Settings',
    ])
    const matches = stdout.matchAll(/^\s+"?([^"\n]+?)"?\s*=\s*\{/gm)
    return Array.from(matches, (match) => match[1]).filter(Boolean)
  } catch {
    return []
  }
}

/**
 * 统一归一化主题 key，兼容 Terminal 导入时可能做的空格折叠
 * @param {string} value
 * @returns {string}
 */
function normalizeThemeKey(value) {
  return String(value || '').replace(/\s+/g, '').toLowerCase()
}

/**
 * 根据主题元数据在系统 Window Settings 里找真实 key
 * 不能只信 predictedSystemKey，因为不同 .terminal 导入后可能改名。
 *
 * @param {object} theme
 * @returns {Promise<string | null>}
 */
async function findInstalledThemeKey(theme) {
  const installedKeys = await readInstalledThemeKeys()
  if (installedKeys.length === 0) return null

  const exactMatch = installedKeys.find(
    (key) => key === theme.predictedSystemKey || key === theme.name,
  )
  if (exactMatch) return exactMatch

  const normalizedTargets = new Set([
    normalizeThemeKey(theme.predictedSystemKey),
    normalizeThemeKey(theme.name),
  ])

  return installedKeys.find((key) => normalizedTargets.has(normalizeThemeKey(key))) || null
}

/**
 * 检查某 systemKey 是否已在系统 Window Settings 里
 * @param {string} systemKey
 * @returns {Promise<boolean>}
 */
async function isThemeInstalled(systemKey) {
  const installedKeys = await readInstalledThemeKeys()
  return installedKeys.includes(systemKey)
}

/**
 * 确保主题已导入系统，返回真实的 systemKey（可能被 Terminal.app 去空格）
 * @param {object} theme - themes-meta 条目
 * @returns {Promise<string>}
 */
async function ensureThemeImported(theme) {
  const existingKey = await findInstalledThemeKey(theme)
  // 已在系统库里则直接用真实 key，避免后续写入猜错名字
  if (existingKey) return existingKey

  // 触发导入：open -a Terminal <file>
  const filePath = theme.filePath || path.join(getResourcesDir(), theme.filename)
  await _execFile('open', ['-a', 'Terminal', filePath])
  // 等 Terminal.app 写回 plist（cfprefsd 延迟，经验值 1.5s 足够）
  await sleep(1500)

  const importedKey = await findInstalledThemeKey(theme)
  if (importedKey) return importedKey
  // 兜底：如果导入后仍没读到真实 key，退回预测值给上层报错/处理
  // defaults write 仍可能失败，上层会 catch
  return theme.predictedSystemKey
}

/**
 * 把某主题设为系统默认
 * @param {string} themeId - themes-meta 里的 id
 * @returns {Promise<{ appliedKey: string }>}
 */
async function setDefault(themeId) {
  const theme = loadThemesMeta().find((t) => t.id === themeId)
  if (!theme) throw new Error(`UNKNOWN_THEME:${themeId}`)

  const systemKey = await ensureThemeImported(theme)
  await writeDefaults(systemKey)
  return { appliedKey: systemKey }
}

/**
 * 恢复系统默认为 Clear Dark
 * @returns {Promise<{ appliedKey: string }>}
 */
async function restoreSystemDefault() {
  await writeDefaults('Clear Dark')
  return { appliedKey: 'Clear Dark' }
}

/**
 * 写 Default/Startup Window Settings 并刷 cfprefsd
 * @param {string} systemKey
 */
async function writeDefaults(systemKey) {
  await _execFile('defaults', [
    'write', 'com.apple.Terminal', 'Default Window Settings', '-string', systemKey,
  ])
  await _execFile('defaults', [
    'write', 'com.apple.Terminal', 'Startup Window Settings', '-string', systemKey,
  ])
  // 强刷 preference daemon；失败不致命（极偶尔 cfprefsd 刚被 killed）
  try {
    await _execFile('killall', ['cfprefsd'])
  } catch (err) {
    console.warn('[terminal-theme] killall cfprefsd 失败（已忽略）:', err?.message || err)
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// ---------- 测试钩子 ----------

function __setHomeDir(dir) { _homeDir = dir }
function __setResourcesDir(dir) { _resourcesDir = dir; _themesMetaCache = null }
function __setExecFile(fn) { _execFile = fn }
function __reset() {
  _homeDir = os.homedir()
  _resourcesDir = null
  _themesMetaCache = null
  _execFile = defaultExecFile
}

module.exports = {
  listThemes,
  readCurrentDefault,
  setDefault,
  restoreSystemDefault,
  isThemeInstalled,
  ensureThemeImported,
  __setHomeDir,
  __setResourcesDir,
  __setExecFile,
  __reset,
}
