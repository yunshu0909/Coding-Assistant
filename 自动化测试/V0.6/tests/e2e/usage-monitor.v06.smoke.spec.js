/**
 * V0.6 用量监测 E2E 冒烟测试
 *
 * 负责：
 * - 校验从工作台导航进入 V0.6 用量监测页
 * - 校验关键结构文案在真实 Electron 环境可见
 *
 * @module 自动化测试/V0.6/tests/e2e/usage-monitor.v06.smoke.spec
 */

const { test, expect } = require('@playwright/test')
const { _electron: electron } = require('playwright')

test.describe('V0.6 Usage Monitor E2E', () => {
  let electronApp
  let page

  test.beforeAll(async () => {
    test.setTimeout(60000)
    electronApp = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
      timeout: 60000,
    })
  })

  test.afterAll(async () => {
    // 启动失败时 electronApp 可能为空，避免清理阶段掩盖首个根因
    if (electronApp) {
      await electronApp.close()
    }
  })

  test.beforeEach(async () => {
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
  })

  test('E2E-01: 进入用量监测后应看到周期入口', async () => {
    await page.getByRole('button', { name: '用量监测' }).click()
    await expect(page.getByText('今日')).toBeVisible()
    await expect(page.getByText('近7天')).toBeVisible()
    await expect(page.getByText('近30天')).toBeVisible()
  })

  test('E2E-02: 应展示核心指标标签', async () => {
    await page.getByRole('button', { name: '用量监测' }).click()
    // 限定指标卡区域，避免与明细表头同名文案产生 strict mode 冲突
    await expect(page.locator('.metric-label').filter({ hasText: '总 Token' })).toBeVisible()
    await expect(page.locator('.metric-label').filter({ hasText: '缓存命中' })).toBeVisible()
  })

  test('E2E-03: 应展示模型明细表标题并移除占位文案', async () => {
    await page.getByRole('button', { name: '用量监测' }).click()
    await expect(page.getByText('模型用量明细')).toBeVisible()
    await expect(page.getByText('当前版本为模块占位')).toHaveCount(0)
  })
})
