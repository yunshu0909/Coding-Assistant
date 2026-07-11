/**
 * V1.9.8 安全收口 测试配置（backend）
 *
 * 负责：运行 V1.9.8 backend 测试（导航防护、外链 IPC、settings 写收口、provider 断接线守卫）
 *
 * @module 自动化测试/V1.9.8/vitest.config
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
    include: ['自动化测试/V1.9.8/tests/backend/**/*.{test,spec}.{js,jsx}'],
  },
})
