/**
 * V1.9.8 安全收口 测试配置（frontend）
 *
 * 负责：运行 V1.9.8 frontend 测试（Markdown 外链拦截组件行为）
 *
 * @module 自动化测试/V1.9.8/vitest.frontend.config
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
    include: ['自动化测试/V1.9.8/tests/frontend/**/*.{test,spec}.{js,jsx}'],
  },
})
