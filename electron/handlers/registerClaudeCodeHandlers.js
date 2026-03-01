/**
 * Claude Code 管理 IPC 处理器
 *
 * 负责：
 * - 获取 Claude Code 版本号
 * - 执行版本更新
 * - 运行 Doctor 健康检查
 * - 查询认证状态
 * - 发起登录流程
 * - 执行网络诊断脚本并解析结果
 *
 * @module electron/handlers/registerClaudeCodeHandlers
 */

const { exec, spawn } = require('child_process')
const fs = require('fs/promises')
const path = require('path')
const os = require('os')
const Store = require('electron-store').default

/** @type {Store} 应用配置存储 */
const store = new Store()

/**
 * 默认诊断脚本路径
 * @type {string}
 */
const DEFAULT_NETWORK_SCRIPT = '~/Documents/0109todo/scripts/claude_env_check.sh'

/**
 * 各命令超时时间（毫秒）
 * @type {Object<string, number>}
 */
const TIMEOUTS = {
  version: 15_000,
  update: 60_000,
  doctor: 15_000,
  auth: 15_000,
  authLogin: 30_000,
  network: 30_000,
}

/**
 * 将 ~ 展开为用户主目录
 * @param {string} filepath - 原始路径
 * @returns {string} 展开后的绝对路径
 */
function expandHomePath(filepath) {
  if (filepath && filepath.startsWith('~/')) {
    return path.join(os.homedir(), filepath.slice(2))
  }
  return filepath
}

/**
 * 包装 exec 为 Promise，支持超时和自定义选项
 * @param {string} command - 要执行的命令
 * @param {number} timeout - 超时毫秒数
 * @param {Object} [opts] - 额外的 exec 选项
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function execAsync(command, timeout, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = exec(command, { timeout, ...opts }, (error, stdout, stderr) => {
      if (error) {
        // 保留 stdout/stderr 到 error 对象，便于即使退出码非零也能解析输出
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
      } else {
        resolve({ stdout: stdout || '', stderr: stderr || '' })
      }
    })
  })
}

/**
 * 从 claude --version 输出中提取版本号
 * @param {string} output - 命令输出
 * @returns {string|null} 版本号（如 "2.1.63"）或 null
 */
function parseVersion(output) {
  const match = output.match(/(\d+\.\d+\.\d+)/)
  return match ? match[1] : null
}

/**
 * 解析 claude update 输出，判断是否更新
 *
 * 可能的输出模式：
 * - "Already up to date" / "already" → 已是最新
 * - 含有新版本号 → 已更新
 *
 * @param {string} output - 命令输出
 * @returns {{ updated: boolean, alreadyLatest: boolean, newVersion?: string }}
 */
function parseUpdateOutput(output) {
  const lower = output.toLowerCase()

  if (lower.includes('already up to date') || lower.includes('already')) {
    return { updated: false, alreadyLatest: true }
  }

  // 尝试从输出中提取更新后的版本号
  const versionMatch = output.match(/(\d+\.\d+\.\d+)/)
  if (versionMatch) {
    return { updated: true, alreadyLatest: false, newVersion: versionMatch[1] }
  }

  return { updated: true, alreadyLatest: false }
}

/**
 * 解析 claude doctor 输出，判断健康状态
 * @param {string} output - 命令输出
 * @returns {{ healthy: boolean, details: string }}
 */
function parseDoctorOutput(output) {
  const lower = output.toLowerCase()
  // doctor 输出如含 error/fail/issue 视为不健康
  const hasProblems = /\b(error|fail|issue|problem|warning)\b/.test(lower)
  return { healthy: !hasProblems, details: output.trim() }
}

/**
 * 解析 claude auth status 输出
 *
 * 退出码 0=已登录，1=未登录
 * 输出可能包含 JSON 或纯文本
 *
 * @param {string} output - 命令输出
 * @param {number} exitCode - 进程退出码
 * @returns {{ loggedIn: boolean, authMethod?: string, plan?: string, rawOutput: string }}
 */
function parseAuthOutput(output, exitCode) {
  const result = { loggedIn: exitCode === 0, rawOutput: output.trim() }

  // 尝试从输出中提取认证方式和计划
  const lower = output.toLowerCase()

  if (lower.includes('oauth')) {
    result.authMethod = 'oauth'
  } else if (lower.includes('api_key') || lower.includes('api key')) {
    result.authMethod = 'api_key'
  }

  // 解析订阅计划
  const planMatch = lower.match(/\b(max|pro|free|team|enterprise)\b/)
  if (planMatch) {
    result.plan = planMatch[1]
  }

  return result
}

/**
 * 将脚本分段名映射为中文标签
 * @type {Object<string, string>}
 */
const SECTION_NAME_MAP = {
  'system proxy': '系统代理',
  'tun and route': 'TUN 路由',
  'egress country': '出口国家',
  'anthropic reachability': 'API 连通',
  'recent claude logs': '403 监测',
}

/**
 * 解析网络诊断脚本输出
 *
 * 执行步骤：
 * 1. 按 == section_name == 分段
 * 2. 每段提取最后一个 [PASS]/[WARN]/[FAIL] 标记及其详情
 * 3. 统计各状态计数，判定 overall
 *
 * @param {string} output - 脚本原始输出
 * @param {number} exitCode - 脚本退出码（1=有 FAIL）
 * @returns {{ overall: string, passCount: number, warnCount: number, failCount: number, checks: Array<{name: string, status: string, detail: string}> }}
 */
function parseNetworkOutput(output, exitCode) {
  const checks = []
  let passCount = 0
  let warnCount = 0
  let failCount = 0

  // 按 == section == 分段（忽略头部和 Result 段）
  const sectionRegex = /==\s*(.+?)\s*==/g
  const sections = []
  let match

  while ((match = sectionRegex.exec(output)) !== null) {
    sections.push({ name: match[1], startIndex: match.index + match[0].length })
  }

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    const endIndex = i + 1 < sections.length ? sections[i + 1].startIndex - sections[i + 1].name.length - 6 : output.length
    const content = output.slice(section.startIndex, endIndex)

    // 跳过头部总览段和结果段
    const nameLower = section.name.toLowerCase()
    if (nameLower.includes('self-check') || nameLower === 'result') continue

    // 提取最后一个 [PASS]/[WARN]/[FAIL] 行
    const statusLines = content.match(/\[(PASS|WARN|FAIL)\]\s*(.*)/g)
    if (!statusLines || statusLines.length === 0) continue

    const lastLine = statusLines[statusLines.length - 1]
    const statusMatch = lastLine.match(/\[(PASS|WARN|FAIL)\]\s*(.*)/)
    if (!statusMatch) continue

    const status = statusMatch[1].toLowerCase()
    const detail = statusMatch[2].trim()
    const displayName = SECTION_NAME_MAP[nameLower] || section.name

    checks.push({ name: displayName, status, detail })

    if (status === 'pass') passCount++
    else if (status === 'warn') warnCount++
    else if (status === 'fail') failCount++
  }

  // overall 判定：有 FAIL=fail，有 WARN=warn，否则 pass
  let overall = 'pass'
  if (failCount > 0) overall = 'fail'
  else if (warnCount > 0) overall = 'warn'

  return { overall, passCount, warnCount, failCount, checks }
}

/**
 * 判断错误是否为命令未找到
 * @param {Error} error - exec 错误
 * @returns {boolean}
 */
function isNotInstalled(error) {
  return error.code === 'ENOENT' ||
    (error.message && error.message.includes('not found')) ||
    (error.stderr && error.stderr.includes('not found')) ||
    (error.message && error.message.includes('ENOENT'))
}

/**
 * 判断错误是否为超时
 * @param {Error} error - exec 错误
 * @returns {boolean}
 */
function isTimeout(error) {
  return error.killed === true || error.code === 'ERR_CHILD_PROCESS_TIMEOUT'
}

/**
 * 注册 Claude Code 管理相关 IPC handlers
 * @param {Object} deps - 依赖注入
 * @param {Electron.IpcMain} deps.ipcMain - IPC 主进程对象
 */
function registerClaudeCodeHandlers({ ipcMain }) {

  /**
   * 获取 Claude Code 版本号
   * @returns {Promise<{success: boolean, version?: string, errorCode?: string, error?: string}>}
   */
  ipcMain.handle('claudeCode:getVersion', async () => {
    try {
      const { stdout } = await execAsync('claude --version', TIMEOUTS.version)
      const version = parseVersion(stdout)
      if (!version) {
        return { success: false, errorCode: 'PARSE_ERROR', error: '无法解析版本号' }
      }
      return { success: true, version }
    } catch (error) {
      if (isNotInstalled(error)) {
        return { success: false, errorCode: 'NOT_INSTALLED', error: '未检测到 Claude Code CLI' }
      }
      if (isTimeout(error)) {
        return { success: false, errorCode: 'TIMEOUT', error: '版本检查超时' }
      }
      return { success: false, errorCode: 'EXEC_ERROR', error: error.message }
    }
  })

  /**
   * 执行 Claude Code 更新
   * @returns {Promise<{success: boolean, updated?: boolean, newVersion?: string, alreadyLatest?: boolean, errorCode?: string, error?: string}>}
   */
  ipcMain.handle('claudeCode:checkUpdate', async () => {
    try {
      const { stdout } = await execAsync('claude update', TIMEOUTS.update)
      const result = parseUpdateOutput(stdout)
      return { success: true, ...result }
    } catch (error) {
      if (isNotInstalled(error)) {
        return { success: false, errorCode: 'NOT_INSTALLED', error: '未检测到 Claude Code CLI' }
      }
      if (isTimeout(error)) {
        return { success: false, errorCode: 'TIMEOUT', error: '更新操作超时' }
      }
      // 部分更新工具即使"成功"也可能返回非零退出码，尝试解析 stdout
      if (error.stdout) {
        const result = parseUpdateOutput(error.stdout)
        if (result.updated || result.alreadyLatest) {
          return { success: true, ...result }
        }
      }
      return { success: false, errorCode: 'UPDATE_FAILED', error: error.message }
    }
  })

  /**
   * 执行 Doctor 健康检查
   * @returns {Promise<{success: boolean, healthy?: boolean, details?: string, errorCode?: string, error?: string}>}
   */
  ipcMain.handle('claudeCode:doctor', async () => {
    try {
      const { stdout } = await execAsync('claude doctor', TIMEOUTS.doctor)
      const result = parseDoctorOutput(stdout)
      return { success: true, ...result }
    } catch (error) {
      if (isNotInstalled(error)) {
        return { success: false, errorCode: 'NOT_INSTALLED', error: '未检测到 Claude Code CLI' }
      }
      if (isTimeout(error)) {
        return { success: false, errorCode: 'TIMEOUT', error: 'Doctor 检查超时' }
      }
      // doctor 可能返回非零退出码表示有问题，仍然解析输出
      if (error.stdout) {
        const result = parseDoctorOutput(error.stdout)
        return { success: true, ...result }
      }
      return { success: false, errorCode: 'EXEC_ERROR', error: error.message }
    }
  })

  /**
   * 查询认证状态
   * @returns {Promise<{success: boolean, loggedIn?: boolean, authMethod?: string, plan?: string, rawOutput?: string, errorCode?: string, error?: string}>}
   */
  ipcMain.handle('claudeCode:authStatus', async () => {
    try {
      const { stdout } = await execAsync('claude auth status', TIMEOUTS.auth)
      const result = parseAuthOutput(stdout, 0)
      return { success: true, ...result }
    } catch (error) {
      if (isNotInstalled(error)) {
        return { success: false, errorCode: 'NOT_INSTALLED', error: '未检测到 Claude Code CLI' }
      }
      if (isTimeout(error)) {
        return { success: false, errorCode: 'TIMEOUT', error: '认证检查超时' }
      }
      // 退出码 1=未登录，仍是有效结果
      if (error.code === 1 || (error.stdout !== undefined)) {
        const result = parseAuthOutput(error.stdout || '', 1)
        return { success: true, ...result }
      }
      return { success: false, errorCode: 'EXEC_ERROR', error: error.message }
    }
  })

  /**
   * 发起登录流程（打开浏览器）
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  ipcMain.handle('claudeCode:authLogin', async () => {
    return new Promise((resolve) => {
      const child = spawn('claude', ['auth', 'login'], {
        stdio: 'ignore',
        detached: true,
        shell: true,
      })

      // 登录流程会打开浏览器，不等待完成
      child.unref()

      child.on('error', (error) => {
        if (isNotInstalled(error)) {
          resolve({ success: false, error: '未检测到 Claude Code CLI' })
        } else {
          resolve({ success: false, error: error.message })
        }
      })

      // 给一小段时间确认进程启动成功
      setTimeout(() => {
        resolve({ success: true })
      }, 500)
    })
  })

  /**
   * 执行网络诊断脚本
   * @returns {Promise<{success: boolean, overall?: string, passCount?: number, warnCount?: number, failCount?: number, checks?: Array, rawOutput?: string, errorCode?: string, error?: string}>}
   */
  ipcMain.handle('claudeCode:networkCheck', async () => {
    const configPath = store.get('claudeCode.networkCheckScript', DEFAULT_NETWORK_SCRIPT)
    const scriptPath = expandHomePath(configPath)

    // 检查脚本是否存在
    try {
      await fs.access(scriptPath, fs.constants.F_OK)
    } catch {
      return { success: false, errorCode: 'SCRIPT_NOT_FOUND', error: `诊断脚本不存在: ${scriptPath}` }
    }

    // 检查执行权限
    try {
      await fs.access(scriptPath, fs.constants.X_OK)
    } catch {
      return { success: false, errorCode: 'PERMISSION_DENIED', error: '诊断脚本无执行权限，请运行 chmod +x' }
    }

    try {
      const { stdout } = await execAsync(`bash "${scriptPath}"`, TIMEOUTS.network)
      const result = parseNetworkOutput(stdout, 0)
      return { success: true, ...result, rawOutput: stdout }
    } catch (error) {
      if (isTimeout(error)) {
        return { success: false, errorCode: 'TIMEOUT', error: '网络诊断超时' }
      }
      // 脚本 FAIL 时 exit code=1，但 stdout 仍有有效输出
      if (error.stdout) {
        const result = parseNetworkOutput(error.stdout, error.code || 1)
        return { success: true, ...result, rawOutput: error.stdout }
      }
      return { success: false, errorCode: 'EXEC_ERROR', error: error.message }
    }
  })
}

module.exports = { registerClaudeCodeHandlers }
