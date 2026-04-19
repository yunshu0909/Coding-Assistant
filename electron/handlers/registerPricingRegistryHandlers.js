/**
 * 定价注册表 IPC 注册模块
 *
 * 负责：
 * - 暴露 pricing-registry:get IPC，供渲染层读取当前生效的 pricing 快照
 * - 封装对 remoteConfigLoader 的调用
 *
 * @module electron/handlers/registerPricingRegistryHandlers
 */

const { getRemoteConfig } = require('../services/remoteConfigLoader')

/**
 * 注册 pricing registry IPC handlers
 * @param {Object} deps - 依赖
 * @param {Electron.IpcMain} deps.ipcMain - Electron ipcMain
 */
function registerPricingRegistryHandlers({ ipcMain }) {
  ipcMain.handle('pricing-registry:get', () => {
    const { config, source } = getRemoteConfig('pricing')
    return { success: true, registry: config, source }
  })
}

module.exports = {
  registerPricingRegistryHandlers,
}
