/**
 * 文档查阅 IPC 处理模块
 *
 * 负责：
 * - 注册文件夹管理（添加/移除/列表）IPC channel
 * - 注册文件列表和文件读取 IPC channel
 * - 注册文件夹选择对话框 IPC channel
 *
 * @module electron/handlers/registerDocBrowserHandlers
 */

const { dialog } = require('electron')
const { listFolders, addFolder, removeFolder, listFiles, readFile } = require('../services/docBrowserService')

/**
 * 注册文档查阅 IPC handlers
 * @param {Object} deps
 * @param {import('electron').IpcMain} deps.ipcMain
 * @param {import('electron').BrowserWindow} [deps.getMainWindow] - 获取主窗口的函数
 */
function registerDocBrowserHandlers({ ipcMain, getMainWindow }) {
  /**
   * 打开文件夹选择对话框
   */
  ipcMain.handle('doc:selectFolder', async () => {
    try {
      const mainWindow = getMainWindow?.()
      const options = { properties: ['openDirectory'], title: '选择文件夹' }
      const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, options)
        : await dialog.showOpenDialog(options)
      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, data: null, error: null }
      }
      return { success: true, data: result.filePaths[0], error: null }
    } catch (error) {
      return { success: false, data: null, error: error.message }
    }
  })

  /**
   * 添加文件夹（校验 + 扫描 + 持久化）
   */
  ipcMain.handle('doc:addFolder', async (_event, folderPath) => {
    try {
      return await addFolder(folderPath)
    } catch (error) {
      return { success: false, data: null, error: error.message, errorCode: error.errorCode }
    }
  })

  /**
   * 移除文件夹
   */
  ipcMain.handle('doc:removeFolder', (_event, folderPath) => {
    try {
      return removeFolder(folderPath)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  /**
   * 获取已保存的文件夹列表（含路径校验）
   */
  ipcMain.handle('doc:listFolders', async () => {
    try {
      const folders = await listFolders()
      return { success: true, data: folders, error: null }
    } catch (error) {
      return { success: false, data: null, error: error.message }
    }
  })

  /**
   * 列出文件夹下的所有 .md 文件
   */
  ipcMain.handle('doc:listFiles', async (_event, folderPath) => {
    try {
      const files = await listFiles(folderPath)
      return { success: true, data: files, error: null }
    } catch (error) {
      return { success: false, data: null, error: error.message }
    }
  })

  /**
   * 读取 .md 文件内容
   */
  ipcMain.handle('doc:readFile', async (_event, filePath) => {
    try {
      const data = await readFile(filePath)
      return { success: true, data, error: null }
    } catch (error) {
      return { success: false, data: null, error: error.message }
    }
  })
}

module.exports = { registerDocBrowserHandlers }
