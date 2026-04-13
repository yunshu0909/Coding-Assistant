/**
 * Claude 会员额度状态 IPC 处理模块
 *
 * 负责：
 * - 读取 Claude Code 会员额度状态接入状态
 * - 自动安装或修复 CodePal 管理的 statusLine
 * - 保存额度显示模式与阈值配置
 *
 * @module electron/handlers/registerClaudeUsageStatusHandlers
 */

const { createClaudeSettingsService } = require('../services/claudeSettingsService')
const { createClaudeUsageStatusService } = require('../services/claudeUsageStatusService')

/**
 * 注册 Claude 会员额度状态 IPC handlers
 * @param {Object} deps - 依赖注入
 * @param {import('electron').IpcMain} deps.ipcMain - Electron ipcMain
 * @param {(filepath: string) => Promise<boolean>} deps.pathExists - 路径存在检查
 */
function registerClaudeUsageStatusHandlers({ ipcMain, pathExists }) {
  const claudeSettingsService = createClaudeSettingsService({ pathExists })
  const claudeUsageStatusService = createClaudeUsageStatusService({
    pathExists,
    claudeSettingsService,
  })

  /**
   * IPC: 获取 Claude 会员额度状态
   */
  ipcMain.handle('claude-usage-status:get-state', async () => {
    return claudeUsageStatusService.getUsageStatusState()
  })

  /**
   * IPC: 自动安装或修复 Claude 会员额度状态
   * @param {Electron.IpcMainInvokeEvent} event - IPC 事件
   * @param {{force?: boolean}} options - 安装选项
   */
  ipcMain.handle('claude-usage-status:ensure-installed', async (event, options = {}) => {
    const force = Boolean(options?.force)
    return claudeUsageStatusService.ensureUsageStatusInstalled({ force })
  })

  /**
   * IPC: 保存 Claude 会员额度状态配置
   * @param {Electron.IpcMainInvokeEvent} event - IPC 事件
   * @param {{displayMode?: string, fiveHourThreshold?: number, sevenDayThreshold?: number}} config - 配置数据
   */
  ipcMain.handle('claude-usage-status:save-config', async (event, config = {}) => {
    return claudeUsageStatusService.saveUsageStatusConfig(config)
  })

  /**
   * IPC: 获取 7d 周期满载率历史（v1.4.1 新增，供满载率趋势卡渲染）
   */
  ipcMain.handle('claude-usage-status:get-history', async () => {
    return claudeUsageStatusService.getUsageHistory()
  })
}

module.exports = {
  registerClaudeUsageStatusHandlers,
}
