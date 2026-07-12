/**
 * V1.9.9 可信度与后台行为收口测试配置
 *
 * @module 自动化测试/V1.9.9/vitest.config
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
    setupFiles: ['自动化测试/V1.9.9/setup.js'],
    include: ['自动化测试/V1.9.9/tests/**/*.{test,spec}.{js,jsx}'],
    sequence: {
      concurrent: false,
    },
  },
})
