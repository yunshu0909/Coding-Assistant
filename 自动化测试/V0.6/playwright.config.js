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
