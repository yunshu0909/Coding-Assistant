/**
 * Codex 账户 IPC 注册
 *
 * 注册的 channels：
 *   codex-account:list          — 列所有账户 + 当前激活
 *   codex-account:save          — 保存当前 auth.json 为新槽位
 *   codex-account:switch        — 切换账户（含 Codex 重启）
 *   codex-account:rename        — 重命名槽位
 *   codex-account:delete        — 删除槽位（留冷备份）
 *   codex-account:detect-storage — 检测 file/keyring 模式
 *   codex-account:open-codex    — 打开 Codex.app
 *
 * 另外启动一个 chokidar 监听器，通过 webContents.send
 * 向渲染进程推送 codex-account:new-account-detected 事件。
 *
 * @module electron/handlers/registerCodexAccountHandlers
 */

const accountService = require('../services/codexAccountService')
const authWatcher = require('../services/codexAuthWatcher')

let _stopWatcher = null

/**
 * 注册 Codex 账户相关 IPC + 启动 watcher
 * @param {object} deps
 * @param {import('electron').IpcMain} deps.ipcMain
 * @param {() => import('electron').BrowserWindow | null} deps.getMainWindow
 */
function registerCodexAccountHandlers({ ipcMain, getMainWindow }) {
  // 启动 watcher（整个 app 生命周期一份）
  if (!_stopWatcher) {
    _stopWatcher = authWatcher.startWatching({
      onNewAccountDetected: (payload) => {
        const win = typeof getMainWindow === 'function' ? getMainWindow() : null
        if (win && !win.isDestroyed()) {
          win.webContents.send('codex-account:new-account-detected', payload)
        }
      },
      onError: (err) => {
        console.warn('[codex-account:watcher]', err?.message || err)
      },
    })
  }

  ipcMain.handle('codex-account:list', async () => {
    try {
      const result = await accountService.listSavedAccounts()
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error?.message || 'LIST_FAILED' }
    }
  })

  ipcMain.handle('codex-account:save', async (_event, payload) => {
    const { name } = payload || {}
    try {
      return await accountService.saveAccount(name)
    } catch (error) {
      return { success: false, error: error?.message || 'SAVE_FAILED' }
    }
  })

  ipcMain.handle('codex-account:switch', async (_event, payload) => {
    const { targetName } = payload || {}
    try {
      return await accountService.switchAccount(targetName)
    } catch (error) {
      return { success: false, error: error?.message || 'SWITCH_FAILED' }
    }
  })

  ipcMain.handle('codex-account:rename', async (_event, payload) => {
    const { oldName, newName } = payload || {}
    try {
      return await accountService.renameAccount(oldName, newName)
    } catch (error) {
      return { success: false, error: error?.message || 'RENAME_FAILED' }
    }
  })

  ipcMain.handle('codex-account:delete', async (_event, payload) => {
    const { name } = payload || {}
    try {
      return await accountService.deleteAccount(name)
    } catch (error) {
      return { success: false, error: error?.message || 'DELETE_FAILED' }
    }
  })

  ipcMain.handle('codex-account:detect-storage', async () => {
    try {
      return { success: true, ...(await accountService.detectStorageMode()) }
    } catch (error) {
      return { success: false, error: error?.message || 'DETECT_FAILED' }
    }
  })

  ipcMain.handle('codex-account:open-codex', async () => {
    try {
      return await accountService.openCodex()
    } catch (error) {
      return { success: false, error: error?.message || 'OPEN_FAILED' }
    }
  })
}

/**
 * 停止 watcher（app quit 时调）
 */
async function stopCodexAccountWatcher() {
  if (_stopWatcher) {
    await _stopWatcher()
    _stopWatcher = null
  }
}

module.exports = { registerCodexAccountHandlers, stopCodexAccountWatcher }
