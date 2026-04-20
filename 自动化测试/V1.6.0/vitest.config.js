/**
 * V1.6.0 测试配置
 *
 * 覆盖：
 * - terminalThemeService（plist 读写 + killall cfprefsd 调用 + 主题导入逻辑,全部 execFile mock）
 *
 * @module 自动化测试/V1.6.0/vitest.config
 */

import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const configDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [resolve(configDir, '**/*.{test,spec}.{js,jsx}')],
    css: false,
    testTimeout: 15000,
  },
})
