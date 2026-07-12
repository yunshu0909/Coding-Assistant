/**
 * Codex 会员额度状态服务
 *
 * 负责：
 * - 从 ~/.codex/sessions 的会话日志读取 Codex 最新 rate_limits（5 小时 / 7 天窗口）
 * - 把 Codex 原始字段归一化成与 Claude snapshot 完全相同的形状（前端组件零改动复用）
 * - 汇总前端展示所需的接入状态（ready / no_data / no_rate_limits / read_error）
 *
 * 与 Claude 的本质区别：Codex 零配置——CLI 自己把 rate_limits 写进 session 日志，
 * 本服务只被动读取，不安装脚本、不写任何文件、无 install/config/conflict 概念。
 *
 * @module electron/services/codexUsageStatusService
 */

const path = require('path')
const os = require('os')
const { scanLogFilesInRange } = require('../logScanner')
const { parseCodexRateLimits, pathExists } = require('./usageLogScanService')

// 取最新额度只需近几天日志：7 天窗口 + 1 天缓冲。
// 更早的会话即便有 rate_limits 也早已被官方重置，无展示意义。
const LOOKBACK_DAYS = 8
const LOOKBACK_MS = LOOKBACK_DAYS * 24 * 60 * 60 * 1000
// 按 mtime 倒序，最新会话一定在最前；近 8 天 200 个会话文件绰绰有余。
const MAX_FILES = 200
// rate_limits 在每次 token_count 都写，尾部 5000 行必含最新值。
const MAX_LINES_PER_FILE = 5000

/**
 * 把额度百分比归一化为 [0,100] 整数；无效值返回 null。
 * 注意：0 是合法值（用量为 0），不能当 falsy 漏掉。
 * @param {unknown} value - 原始 used_percent
 * @returns {number|null}
 */
function clampPercentage(value) {
  // 显式 null/undefined 当无数据（注意 Number(null)===0，不能交给 Number 判，否则 null 会变 0%）
  if (value === null || value === undefined) return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return Math.max(0, Math.min(100, Math.round(num)))
}

/**
 * 归一化重置时间戳。Codex 的 resets_at 本就是 unix 秒整数，直接透传；
 * 缺失 / 0 / 负 / 非数一律 null（前端会显示「距重置 --」）。
 * @param {unknown} value - 原始 resets_at（unix 秒）
 * @returns {number|null}
 */
function toResetUnixSeconds(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  return Math.floor(num)
}

/**
 * 把 Codex rate_limits 原始结构归一化成 Claude-shape snapshot。
 * 字段名与 claudeUsageStatusService 的 snapshot 完全一致，前端 UsageRow 零改动复用。
 *
 * @param {object} rateLimits - payload.rate_limits（含 primary / secondary）
 * @param {Date|null} timestamp - 行级 timestamp（写入时刻，作为 updatedAt 来源）
 * @returns {{fiveHourUsedPercentage:number|null, sevenDayUsedPercentage:number|null, resetsAt:number|null, sevenDayResetsAt:number|null, updatedAt:number|null, hasRateLimits:boolean}}
 */
function normalizeCodexSnapshot(rateLimits, timestamp) {
  const primary = rateLimits && typeof rateLimits === 'object' ? rateLimits.primary : null
  const secondary = rateLimits && typeof rateLimits === 'object' ? rateLimits.secondary : null

  const fiveHourUsedPercentage = clampPercentage(primary?.used_percent)
  const sevenDayUsedPercentage = clampPercentage(secondary?.used_percent)

  // updatedAt 来自行级 timestamp（ISO 字符串 → unix 秒）；非法时间戳 → null（不触发 stale）
  const tsMs = timestamp instanceof Date ? timestamp.getTime() : NaN
  const updatedAt = Number.isFinite(tsMs) ? Math.floor(tsMs / 1000) : null

  return {
    fiveHourUsedPercentage,
    sevenDayUsedPercentage,
    resetsAt: toResetUnixSeconds(primary?.resets_at),
    sevenDayResetsAt: toResetUnixSeconds(secondary?.resets_at),
    updatedAt,
    // 至少一个窗口有有效百分比才算真的拿到了额度
    hasRateLimits: fiveHourUsedPercentage !== null || sevenDayUsedPercentage !== null
  }
}

/**
 * 扫描近 8 天 Codex 日志，取 timestamp 最新的一条有效 rate_limits 快照。
 *
 * @param {object} [deps] - 依赖注入（测试用）
 * @param {string} [deps.homeDir] - home 目录
 * @param {(p:string)=>Promise<boolean>} [deps.pathExistsFn] - 路径存在检查
 * @param {Function} [deps.scanLogFilesInRangeFn] - 日志扫描
 * @param {number} [deps.now] - 当前毫秒（测试固定时间）
 * @returns {Promise<{sessionsExist:boolean, hadFiles:boolean, snapshot:object|null}>}
 */
async function getLatestCodexRateLimits(deps = {}) {
  const homeDir = deps.homeDir || os.homedir()
  const pathExistsFn = deps.pathExistsFn || pathExists
  const scanFn = deps.scanLogFilesInRangeFn || scanLogFilesInRange
  const nowMs = typeof deps.now === 'number' ? deps.now : Date.now()

  const sessionsDir = path.join(homeDir, '.codex', 'sessions')
  if (!(await pathExistsFn(sessionsDir))) {
    return { sessionsExist: false, hadFiles: false, snapshot: null }
  }

  const start = new Date(nowMs - LOOKBACK_MS)
  const end = new Date(nowMs)
  const scanResult = await scanFn(sessionsDir, start, end, {
    maxFiles: MAX_FILES,
    maxLinesPerFile: MAX_LINES_PER_FILE
  })

  const files = scanResult?.files || []
  const hadFiles = files.length > 0

  // 取全局 timestamp 最大的有效快照（跨文件、跨行；不能只取某文件最后一行——并行会话会乱序）
  let latestSnapshot = null
  let latestTsMs = NaN

  for (const file of files) {
    for (const line of file.lines || []) {
      const parsed = parseCodexRateLimits(line)
      if (!parsed) continue
      const snapshot = normalizeCodexSnapshot(parsed.rateLimits, parsed.timestamp)
      if (!snapshot.hasRateLimits) continue

      const tsMs = parsed.timestamp instanceof Date ? parsed.timestamp.getTime() : NaN
      if (!latestSnapshot) {
        // 首条有效快照无条件作为兜底（即便 ts 无效）
        latestSnapshot = snapshot
        latestTsMs = tsMs
        continue
      }
      // 之后仅当 ts 更新（或现任兜底 ts 无效而新条有效）才替换
      if (Number.isFinite(tsMs) && (!Number.isFinite(latestTsMs) || tsMs > latestTsMs)) {
        latestSnapshot = snapshot
        latestTsMs = tsMs
      }
    }
  }

  return { sessionsExist: true, hadFiles, snapshot: latestSnapshot }
}

/**
 * 汇总前端展示所需的 Codex 会员额度状态。
 *
 * 状态机（简化版，无接入流程）：
 * - no_data：~/.codex/sessions 不存在，或近 8 天没有日志（没用过 / 很久没用 Codex）
 * - no_rate_limits：有近期日志但扫不到 rate_limits（API key 模式 / 非订阅 / 旧版 CLI）
 * - ready：拿到最新有效 rate_limits
 * - read_error：读取过程异常（IPC 层兜底）
 *
 * @param {object} [deps] - 依赖注入（测试用）
 * @returns {Promise<{success:boolean, integrationState:string, snapshot:object|null, sessionsPath:string, message:string, error?:string}>}
 */
async function getCodexUsageStatusState(deps = {}) {
  const homeDir = deps.homeDir || os.homedir()
  const sessionsPath = path.join(homeDir, '.codex', 'sessions')

  try {
    const { sessionsExist, hadFiles, snapshot } = await getLatestCodexRateLimits(deps)

    if (!sessionsExist || !hadFiles) {
      return {
        success: true,
        integrationState: 'no_data',
        snapshot: null,
        sessionsPath,
        message: '未检测到近期 Codex 使用记录。'
      }
    }

    if (!snapshot) {
      return {
        success: true,
        integrationState: 'no_rate_limits',
        snapshot: null,
        sessionsPath,
        message: 'Codex 未返回额度数据（可能是 API key 模式或非订阅账号）。'
      }
    }

    return {
      success: true,
      integrationState: 'ready',
      snapshot,
      sessionsPath,
      message: 'Codex 会员额度已读取。'
    }
  } catch (error) {
    return {
      success: false,
      integrationState: 'read_error',
      snapshot: null,
      sessionsPath,
      message: '读取 Codex 额度时出错。',
      error: error?.message || 'CODEX_USAGE_READ_FAILED'
    }
  }
}

/**
 * 工厂：创建 Codex 会员额度状态服务（与 claudeUsageStatusService 的依赖注入风格一致）
 * @param {object} [deps] - 依赖注入
 * @param {(p:string)=>Promise<boolean>} [deps.pathExists] - 路径存在检查
 * @returns {{getCodexUsageStatusState: () => Promise<object>}}
 */
function createCodexUsageStatusService({ pathExists: injectedPathExists } = {}) {
  const deps = injectedPathExists ? { pathExistsFn: injectedPathExists } : {}
  return {
    getCodexUsageStatusState: () => getCodexUsageStatusState(deps)
  }
}

module.exports = {
  createCodexUsageStatusService,
  getCodexUsageStatusState,
  getLatestCodexRateLimits,
  normalizeCodexSnapshot,
  clampPercentage,
  toResetUnixSeconds,
  LOOKBACK_DAYS
}
