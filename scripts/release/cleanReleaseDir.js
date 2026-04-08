/**
 * Release 目录清理脚本
 *
 * 负责：
 * - 删除旧的 release 构建产物，避免通配符上传混入历史安装包
 * - 重新创建干净的 release 目录，供 electron-builder 输出
 *
 * @module scripts/release/cleanReleaseDir
 */

const fs = require('fs/promises')
const path = require('path')

const releaseDir = path.resolve(__dirname, '..', '..', 'release')

/**
 * 清空 release 目录并重建
 * @returns {Promise<void>}
 */
async function cleanReleaseDir() {
  // 发版资产用通配符上传时，旧文件最容易把 release 搞脏，所以这里直接整目录重建。
  await fs.rm(releaseDir, { recursive: true, force: true })
  await fs.mkdir(releaseDir, { recursive: true })
}

cleanReleaseDir().catch((error) => {
  console.error('[release-clean] failed:', error)
  process.exit(1)
})
