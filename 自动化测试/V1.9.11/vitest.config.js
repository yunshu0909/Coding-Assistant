/**
 * V1.9.11 满载率趋势下线测试配置
 *
 * @module 自动化测试/V1.9.11/vitest.config
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
    setupFiles: ['自动化测试/V1.9.11/setup.js'],
    include: ['自动化测试/V1.9.11/tests/**/*.{test,spec}.{js,jsx}'],
    css: false,
  },
})

