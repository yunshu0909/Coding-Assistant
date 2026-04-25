/**
 * V1.5.3 远程配置防退化测试配置
 *
 * 负责：
 * - 指定 remote-config 防退化回归测试范围
 * - 使用 Node 环境验证主进程配置加载策略
 *
 * @module 自动化测试/V1.5.3/vitest.config
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
    include: ['自动化测试/V1.5.3/tests/**/*.test.js'],
  },
})
