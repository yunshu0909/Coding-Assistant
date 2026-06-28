/**
 * Skill 使用次数 IPC 注册器
 *
 * 负责：
 * - 注册 `aggregate-skill-usage` 通道，统计每个 skill 近 N 天的可用运行样本
 * - 注册 `list-skill-run-samples` 通道，回查单个 skill 的归一化样本
 *
 * @module electron/handlers/registerSkillUsageHandlers
 */

const { scanLogFilesInRange } = require('../logScanner')
const { scanSkillUsage } = require('../services/skillUsageScanService')
const { scanSkillRunSamples } = require('../services/skillRunSampleService')

/**
 * 注册 Skill 使用次数相关 IPC handlers
 * @param {object} params - 注册依赖
 * @param {Electron.IpcMain} params.ipcMain - IPC 主进程实例
 * @param {(filepath: string) => Promise<boolean>} params.pathExists - 路径存在判断
 * @param {string} params.homeDir - 当前用户主目录
 * @param {() => Date} [params.nowFn] - 当前时间工厂（测试用）
 */
function registerSkillUsageHandlers({ ipcMain, pathExists, homeDir, nowFn = () => new Date() }) {
  /**
   * 聚合 skill 使用统计（主数字为清洗后的 usable run samples）
   * @param {Electron.IpcMainInvokeEvent} _event - IPC 事件
   * @param {{windowDays?: number, skillNames?: string[]}} params - 参数
   * @returns {Promise<{success: boolean, data?: object, error?: string}>}
   */
  ipcMain.handle('aggregate-skill-usage', async (_event, params) => {
    try {
      const data = await scanSkillUsage(
        { homeDir, scanLogFilesInRangeFn: scanLogFilesInRange, pathExistsFn: pathExists, nowFn },
        {
          windowDays: params?.windowDays ?? 30,
          skillNames: Array.isArray(params?.skillNames) ? params.skillNames : [],
        }
      )
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error?.message || 'SKILL_USAGE_SCAN_FAILED' }
    }
  })

  /**
   * 获取单个 skill 的归一化运行样本（近 windowDays 天）
   * @param {Electron.IpcMainInvokeEvent} _event - IPC 事件
   * @param {{skillName?: string, windowDays?: number}} params - 参数
   * @returns {Promise<{success: boolean, data?: object, error?: string}>}
   */
  ipcMain.handle('list-skill-run-samples', async (_event, params) => {
    try {
      const skillName = typeof params?.skillName === 'string' ? params.skillName : ''
      if (!skillName) {
        return { success: false, error: 'SKILL_NAME_REQUIRED' }
      }

      const data = await scanSkillRunSamples(
        { homeDir, scanLogFilesInRangeFn: scanLogFilesInRange, pathExistsFn: pathExists, nowFn },
        {
          windowDays: params?.windowDays ?? 30,
          skillNames: [skillName],
        }
      )
      return {
        success: true,
        data: {
          skillName,
          window: data.window,
          startTime: data.startTime,
          endTime: data.endTime,
          sources: data.sources,
          totals: data.totals,
          samples: data.usableSamples.filter((sample) => sample.skillRequested === skillName),
          ledgerPath: data.ledgerPath,
        },
      }
    } catch (error) {
      return { success: false, error: error?.message || 'SKILL_RUN_SAMPLE_SCAN_FAILED' }
    }
  })
}

module.exports = { registerSkillUsageHandlers }
