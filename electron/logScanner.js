/**
 * 日志扫描模块
 *
 * 负责：
 * - 递归收集指定目录下的 `.jsonl` 日志文件
 * - 按文件修改时间筛选时间窗口（半开区间 `[start, end)`）
 * - 按修改时间倒序读取并限制文件数/行数，避免大目录拖垮进程
 *
 * @module electron/logScanner
 */

const fs = require('fs/promises')
const path = require('path')

/**
 * 扫描并读取时间窗口内的日志文件
 * @param {string} basePath - 扫描根目录（已展开）
 * @param {Date} startTime - 开始时间（包含）
 * @param {Date} endTime - 结束时间（不包含）
 * @param {{maxFiles?: number, maxLinesPerFile?: number, maxDepth?: number}} [options] - 扫描选项
 * @returns {Promise<{files: Array<{path: string, lines: string[], mtime: string}>, totalMatched: number, scannedCount: number, truncated: boolean}>}
 */
async function scanLogFilesInRange(basePath, startTime, endTime, options = {}) {
  const maxFiles = typeof options.maxFiles === 'number' ? options.maxFiles : 5000
  const maxLinesPerFile = typeof options.maxLinesPerFile === 'number' ? options.maxLinesPerFile : 10000
  const maxDepth = typeof options.maxDepth === 'number' ? options.maxDepth : 10
  const candidates = []
  const files = []

  /**
   * 递归收集候选日志文件
   * @param {string} currentPath - 当前扫描目录
   * @param {number} depth - 当前递归深度
   * @returns {Promise<void>}
   */
  async function collectCandidates(currentPath, depth = 0) {
    if (depth > maxDepth) return

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name)

        if (entry.isDirectory()) {
          await collectCandidates(fullPath, depth + 1)
          continue
        }

        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) {
          continue
        }

        try {
          const stat = await fs.stat(fullPath)
          const mtime = stat.mtime

          // 采用半开区间，避免边界重复计入
          if (mtime < startTime || mtime >= endTime) {
            continue
          }

          candidates.push({
            path: fullPath,
            mtime
          })
        } catch {
          // 单文件 stat 失败时静默跳过
        }
      }
    } catch {
      // 目录不可读/不存在时静默跳过
    }
  }

  await collectCandidates(basePath, 0)

  // 优先读取最近更新的文件，避免截断时随机漏算
  candidates.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

  const selectedCandidates = candidates.slice(0, maxFiles)
  const truncated = candidates.length > maxFiles

  for (const candidate of selectedCandidates) {
    try {
      const content = await fs.readFile(candidate.path, 'utf-8')
      const lines = content
        .split('\n')
        .filter(line => line.trim())
        .slice(0, maxLinesPerFile)

      files.push({
        path: candidate.path,
        lines,
        mtime: candidate.mtime.toISOString()
      })
    } catch {
      // 单文件读取失败时静默跳过，避免影响整体统计
    }
  }

  return {
    files,
    totalMatched: candidates.length,
    scannedCount: selectedCandidates.length,
    truncated
  }
}

module.exports = {
  scanLogFilesInRange
}

