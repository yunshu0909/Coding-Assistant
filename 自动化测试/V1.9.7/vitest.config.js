/**
 * V1.9.7 新建项目托管 Coding 框架 测试配置
 *
 * 负责：运行 V1.9.7 backend/unit 测试（v3 模板、开发范式配套 key、路由表内容验收、向后兼容、通用化硬验收）
 *
 * @module 自动化测试/V1.9.7/vitest.config
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
    include: ['自动化测试/V1.9.7/tests/**/*.{test,spec}.{js,jsx}'],
  },
})
