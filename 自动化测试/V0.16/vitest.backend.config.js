/**
 * V0.16 后端测试配置
 *
 * 负责：
 * - 指定 model config handler 后端测试范围
 * - 使用 Node 环境执行文件系统断言
 *
 * @module 自动化测试/V0.16/vitest.backend.config
 */

import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const configDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(configDir, '../..')

export default defineConfig({
  root: projectRoot,
  test: {
    environment: 'node',
    globals: true,
    include: ['自动化测试/V0.16/tests/backend/**/*.{test,spec}.js'],
  },
})
