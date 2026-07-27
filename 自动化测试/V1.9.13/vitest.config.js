/**
 * V1.9.13 Codex 额度窗口口径测试配置
 *
 * 负责：
 * - 运行「额度行由窗口数据驱动」的前端渲染测试（happy-dom + RTL）
 *
 * @module 自动化测试/V1.9.13/vitest.config
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
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['自动化测试/V1.9.13/setup.js'],
    include: ['自动化测试/V1.9.13/tests/**/*.{test,spec}.{js,jsx}'],
  },
})
