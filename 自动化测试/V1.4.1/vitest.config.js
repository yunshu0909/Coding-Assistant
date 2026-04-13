/**
 * V1.4.1 前端单元测试配置
 *
 * 负责：
 * - 指定 ClaudeUsageTrendCard 等前端组件测试范围
 * - 使用 jsdom 环境以支持 @testing-library/react 渲染
 * - 配置 React 插件与 @ 别名，支持 JSX 与源码路径解析
 *
 * @module 自动化测试/V1.4.1/vitest.config
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
    setupFiles: ['自动化测试/V1.4.1/setup.js'],
    include: ['自动化测试/V1.4.1/**/*.{test,spec}.{js,jsx}'],
    // CSS 不参与断言，禁用解析避免无意义开销
    css: false,
  },
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src'),
    },
  },
})
