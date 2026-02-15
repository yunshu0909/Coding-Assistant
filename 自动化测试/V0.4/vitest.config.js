/**
 * V0.4 回归测试配置
 *
 * 负责：
 * - 配置 V0.1~V0.4 回归用例的运行入口
 * - 隔离 E2E 与 Vitest 用例
 * - 提供统一路径别名
 *
 * @module auto-test/v04/vitest-config
 */

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const configDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(configDir, '../..')

export default defineConfig({
  root: projectRoot,
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['自动化测试/V0.4/tests/setup.js'],
    include: ['自动化测试/V0.4/tests/**/*.{test,spec}.{js,jsx}'],
    exclude: ['自动化测试/V0.4/tests/e2e/**'],
  },
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src'),
    },
  },
})
