/**
 * 终端外观 IPC 注册
 *
 * 注册的 channels：
 *   terminal-theme:list                      — 列 6 套内置主题 + 系统当前默认
 *   terminal-theme:set-default               — 把某主题设为系统默认
 *   terminal-theme:restore-system-default    — 恢复系统默认为 Clear Dark
 *
 * @module electron/handlers/registerTerminalThemeHandlers
 */

const terminalThemeService = require('../services/terminalThemeService')

/**
 * 注册终端外观相关 IPC
 * @param {object} deps
 * @param {import('electron').IpcMain} deps.ipcMain
 */
function registerTerminalThemeHandlers({ ipcMain }) {
  ipcMain.handle('terminal-theme:list', async () => {
    try {
      const result = await terminalThemeService.listThemes()
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error?.message || 'LIST_FAILED' }
    }
  })

  ipcMain.handle('terminal-theme:set-default', async (_event, payload) => {
    const themeId = payload?.themeId
    if (!themeId) {
      return { success: false, error: 'MISSING_THEME_ID' }
    }
    try {
      const result = await terminalThemeService.setDefault(themeId)
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error?.message || 'SET_DEFAULT_FAILED' }
    }
  })

  ipcMain.handle('terminal-theme:restore-system-default', async () => {
    try {
      const result = await terminalThemeService.restoreSystemDefault()
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error?.message || 'RESTORE_FAILED' }
    }
  })
}

module.exports = { registerTerminalThemeHandlers }
