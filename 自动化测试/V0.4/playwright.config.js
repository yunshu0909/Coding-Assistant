/**
 * V0.4 回归 E2E 配置
 *
 * 负责：
 * - 配置 Electron 冒烟测试入口
 * - 固定串行执行，减少环境干扰
 * - 在失败时保留诊断信息
 *
 * @module auto-test/v04/playwright-config
 */

const { defineConfig } = require('@playwright/test')

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'electron',
      use: {
        browserName: 'chromium',
      },
    },
  ],
})
