/**
 * Playwright E2E 测试配置
 *
 * 负责：
 * - Electron 应用测试配置
 * - 测试环境设置
 *
 * @module playwright.config
 */

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['html', { outputFolder: 'tests/e2e-report' }], ['list']],
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
});
