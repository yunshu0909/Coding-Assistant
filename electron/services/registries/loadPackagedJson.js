/**
 * 打包配置 JSON 读取工具
 *
 * 负责：
 * - 延迟读取项目内的打包配置 JSON
 * - 将“文件缺失/JSON 非法”降级为 null，避免主进程在 require 阶段崩溃
 * - 为各个 registry 提供统一的路径解析入口
 *
 * @module electron/services/registries/loadPackagedJson
 */

const fs = require('node:fs')
const path = require('node:path')

const PROJECT_ROOT = path.resolve(__dirname, '../../../')

/**
 * 安全读取打包进安装包的 JSON 配置
 * @param {string} relativePath - 相对项目根目录的 JSON 路径
 * @returns {object|null}
 */
function loadPackagedJson(relativePath) {
  const absolutePath = path.resolve(PROJECT_ROOT, relativePath)

  try {
    const content = fs.readFileSync(absolutePath, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    // 安装包漏带 json 时不能让主进程启动即崩，交给上层 fallback 继续兜底。
    console.warn(`[registry-packaged] load failed (${relativePath}):`, error?.message || error)
    return null
  }
}

module.exports = {
  loadPackagedJson,
}
