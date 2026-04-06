/**
 * 文档查阅服务
 *
 * 负责：
 * - 管理用户添加的文件夹列表（持久化到 electron-store）
 * - 递归扫描文件夹下的 .md 文件
 * - 读取 .md 文件内容
 * - 启动时校验路径有效性
 *
 * @module electron/services/docBrowserService
 */

const fs = require('fs/promises')
const path = require('path')

const STORE_KEY = 'docBrowser.folders'

/** @type {import('electron-store').default | null} */
let store = null

/**
 * 注入 electron-store 实例
 * @param {import('electron-store').default} storeInstance
 */
function initDocBrowserStore(storeInstance) {
  store = storeInstance
}

/**
 * 递归扫描目录下的所有 .md 文件
 * @param {string} baseDir - 根目录
 * @param {string} [relativeTo=''] - 相对路径前缀（递归用）
 * @returns {Promise<Array<{name: string, relativePath: string, dir: string, fullPath: string, size: number}>>}
 */
async function scanMdFiles(baseDir, relativeTo = '') {
  const results = []

  let entries
  try {
    entries = await fs.readdir(baseDir, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    const fullPath = path.join(baseDir, entry.name)
    const relPath = relativeTo ? path.join(relativeTo, entry.name) : entry.name

    if (entry.isDirectory()) {
      // 跳过隐藏目录和 node_modules
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const subFiles = await scanMdFiles(fullPath, relPath)
      results.push(...subFiles)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      try {
        const stat = await fs.stat(fullPath)
        results.push({
          name: entry.name,
          relativePath: relPath,
          dir: relativeTo || '',
          fullPath,
          size: stat.size,
        })
      } catch {
        // 文件 stat 失败，跳过
      }
    }
  }

  return results
}

/**
 * 获取已保存的文件夹列表 + 校验路径有效性
 * @returns {Promise<Array<{name: string, path: string, fileCount: number, valid: boolean}>>}
 */
async function listFolders() {
  const folders = store.get(STORE_KEY, [])
  const result = []

  for (const folderPath of folders) {
    let valid = false
    let fileCount = 0

    try {
      await fs.access(folderPath)
      valid = true
      const files = await scanMdFiles(folderPath)
      fileCount = files.length
    } catch {
      // 路径不可访问
    }

    result.push({
      name: path.basename(folderPath),
      path: folderPath,
      fileCount,
      valid,
    })
  }

  return result
}

/**
 * 添加文件夹
 * @param {string} folderPath - 文件夹绝对路径
 * @returns {Promise<{success: boolean, data?: object, error?: string, errorCode?: string}>}
 */
async function addFolder(folderPath) {
  const folders = store.get(STORE_KEY, [])

  // 检查重复
  if (folders.includes(folderPath)) {
    return { success: false, error: '该文件夹已在列表中', errorCode: 'DUPLICATE' }
  }

  // 检查路径可访问
  try {
    await fs.access(folderPath)
  } catch {
    return { success: false, error: '无法访问该文件夹，请检查路径和权限', errorCode: 'ACCESS_DENIED' }
  }

  // 扫描 .md 文件
  const files = await scanMdFiles(folderPath)

  // 持久化
  folders.push(folderPath)
  store.set(STORE_KEY, folders)

  return {
    success: true,
    data: {
      name: path.basename(folderPath),
      path: folderPath,
      fileCount: files.length,
      files,
    },
  }
}

/**
 * 移除文件夹
 * @param {string} folderPath - 文件夹路径
 * @returns {{success: boolean}}
 */
function removeFolder(folderPath) {
  const folders = store.get(STORE_KEY, [])
  const updated = folders.filter(f => f !== folderPath)
  store.set(STORE_KEY, updated)
  return { success: true }
}

/**
 * 列出指定文件夹下的所有 .md 文件
 * @param {string} folderPath - 文件夹路径
 * @returns {Promise<Array<{name: string, relativePath: string, dir: string, fullPath: string, size: number}>>}
 */
async function listFiles(folderPath) {
  return scanMdFiles(folderPath)
}

/**
 * 读取 .md 文件内容
 * @param {string} filePath - 文件绝对路径
 * @returns {Promise<{content: string, size: number}>}
 */
async function readFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8')
  const stat = await fs.stat(filePath)
  return { content, size: stat.size }
}

module.exports = { initDocBrowserStore, listFolders, addFolder, removeFolder, listFiles, readFile }
