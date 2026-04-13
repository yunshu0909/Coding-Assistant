/**
 * V0.16 Claude 会员额度状态服务后端行为测试
 *
 * 负责：
 * - 校验 Claude 状态接入的识别与冲突分支
 * - 校验接入安装流程会写入脚本、配置与 settings
 * - 校验显示配置保存时会做阈值归一化
 *
 * @module 自动化测试/V0.16/tests/backend/claudeUsageStatusService.v16.behavior.test
 */

import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

const require = createRequire(import.meta.url)

/**
 * 判断路径是否存在
 * @param {string} checkPath - 目标路径
 * @returns {Promise<boolean>}
 */
async function pathExists(checkPath) {
  try {
    await fs.access(checkPath)
    return true
  } catch {
    return false
  }
}

/**
 * 在指定 HOME 下重新加载待测模块
 *
 * 为什么要重新加载：
 * - 服务模块在加载时会基于 os.homedir() 固化 Claude 配置路径。
 * - 必须先切换 HOME，再 require fresh，测试读写才会命中临时目录。
 *
 * @param {string} tempHome - 临时 HOME
 * @returns {object}
 */
function loadClaudeUsageStatusModuleWithHome(tempHome) {
  process.env.HOME = tempHome
  process.env.USERPROFILE = tempHome
  process.env.PATH = '/nonexistent'

  const permissionModulePath = require.resolve('../../../../electron/handlers/permissionModeHandlers')
  const serviceModulePath = require.resolve('../../../../electron/services/claudeUsageStatusService')

  delete require.cache[permissionModulePath]
  delete require.cache[serviceModulePath]

  return require(serviceModulePath)
}

/**
 * 创建 Claude settings 读取服务桩
 * @param {string} settingsPath - settings.json 路径
 * @returns {{readClaudeSettingsFile: () => Promise<object>}}
 */
function createClaudeSettingsService(settingsPath) {
  return {
    async readClaudeSettingsFile() {
      try {
        const content = await fs.readFile(settingsPath, 'utf-8')
        try {
          return {
            success: true,
            exists: true,
            content,
            data: JSON.parse(content),
          }
        } catch {
          return {
            success: false,
            exists: true,
            content,
            data: {},
            error: 'Claude settings JSON 解析失败',
            errorCode: 'CONFIG_CORRUPTED',
          }
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          return {
            success: true,
            exists: false,
            content: '',
            data: {},
          }
        }

        return {
          success: false,
          exists: false,
          content: '',
          data: {},
          error: error.message,
          errorCode: 'READ_FAILED',
        }
      }
    },
  }
}

describe.sequential('V0.16 Claude Usage Status Service', () => {
  let tempHome
  let originalHome
  let originalUserProfile
  let originalPath
  let moduleUnderTest
  let service
  let settingsPath

  beforeEach(async () => {
    originalHome = process.env.HOME
    originalUserProfile = process.env.USERPROFILE
    originalPath = process.env.PATH

    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-usage-status-v16-'))
    moduleUnderTest = loadClaudeUsageStatusModuleWithHome(tempHome)
    settingsPath = path.join(tempHome, '.claude', 'settings.json')
    service = moduleUnderTest.createClaudeUsageStatusService({
      pathExists,
      claudeSettingsService: createClaudeSettingsService(settingsPath),
    })
  })

  afterEach(async () => {
    process.env.HOME = originalHome
    process.env.USERPROFILE = originalUserProfile
    process.env.PATH = originalPath
    await fs.rm(tempHome, { recursive: true, force: true })
  })

  it('TC-BE-CLAUDE-01: 未检测到 Claude Code 时应返回 not_installed', async () => {
    const result = await service.getUsageStatusState()

    expect(result.success).toBe(true)
    expect(result.claudeInstalled).toBe(false)
    expect(result.integrationState).toBe('not_installed')
  })

  it('TC-BE-CLAUDE-02: 用户已有自定义 statusLine 时应返回 conflict', async () => {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true })
    await fs.writeFile(settingsPath, JSON.stringify({
      statusLine: {
        type: 'command',
        command: 'bash "/tmp/custom-statusline.sh"',
      },
    }, null, 2), 'utf-8')

    const result = await service.getUsageStatusState()

    expect(result.success).toBe(true)
    expect(result.claudeInstalled).toBe(true)
    expect(result.integrationState).toBe('conflict')
    expect(result.hasCustomStatusLine).toBe(true)
  })

  it('TC-BE-CLAUDE-03: 安装接入后应写入 settings、脚本与默认配置', async () => {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true })
    await fs.writeFile(settingsPath, JSON.stringify({
      permissions: { defaultMode: 'acceptEdits' },
    }, null, 2), 'utf-8')

    const result = await service.ensureUsageStatusInstalled()
    const writtenSettings = JSON.parse(await fs.readFile(settingsPath, 'utf-8'))
    const scriptContent = await fs.readFile(moduleUnderTest.STATUS_SCRIPT_PATH, 'utf-8')
    const savedConfig = JSON.parse(await fs.readFile(moduleUnderTest.STATUS_CONFIG_PATH, 'utf-8'))

    expect(result.success).toBe(true)
    expect(result.integrationState).toBe('waiting_for_data')
    expect(writtenSettings.permissions.defaultMode).toBe('acceptEdits')
    expect(writtenSettings.statusLine.command).toBe(moduleUnderTest.MANAGED_STATUS_COMMAND)
    expect(scriptContent).toContain('CodePal-managed Claude Code usage status line')
    expect(savedConfig.displayMode).toBe('always')
    expect(savedConfig.fiveHourThreshold).toBe(70)
    expect(savedConfig.sevenDayThreshold).toBe(70)
  })

  it('TC-BE-CLAUDE-04: 保存显示配置时应自动归一化非法阈值', async () => {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true })
    await fs.writeFile(settingsPath, JSON.stringify({}, null, 2), 'utf-8')

    const result = await service.saveUsageStatusConfig({
      displayMode: 'threshold',
      fiveHourThreshold: 150,
      sevenDayThreshold: -3,
    })

    expect(result.success).toBe(true)
    expect(result.config.displayMode).toBe('threshold')
    expect(result.config.fiveHourThreshold).toBe(100)
    expect(result.config.sevenDayThreshold).toBe(0)
  })
})
