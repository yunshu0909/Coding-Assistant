const { test, expect } = require('@playwright/test')
const { _electron: electron } = require('playwright')

test.describe('V0.5 Workbench E2E', () => {
  let electronApp
  let page

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    })
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test.beforeEach(async () => {
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
  })

  test('E2E-01: 默认进入 Workbench 并显示导航', async () => {
    await expect(page.getByRole('button', { name: '技能管理' })).toBeVisible()
    await expect(page.getByRole('button', { name: '用量监测' })).toBeVisible()
  })

  test('E2E-02: 从技能管理切换到用量监测', async () => {
    await page.getByRole('button', { name: '用量监测' }).click()
    await expect(page.getByRole('heading', { name: '用量监测' })).toBeVisible()
    await expect(page.getByText('当前版本为模块占位')).toBeVisible()
  })

  test('E2E-03: 从用量监测切回技能管理', async () => {
    await page.getByRole('button', { name: '用量监测' }).click()
    await expect(page.getByText('当前版本为模块占位')).toBeVisible()

    await page.getByRole('button', { name: '技能管理' }).click()
    await expect(page.getByRole('heading', { name: 'Skill Manager' })).toBeVisible()
    await expect(page.getByPlaceholder('搜索 skill...')).toBeVisible()
  })

  test('E2E-04: 多次切换保持稳定', async () => {
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: '用量监测' }).click()
      await expect(page.getByText('当前版本为模块占位')).toBeVisible()

      await page.getByRole('button', { name: '技能管理' }).click()
      await expect(page.getByPlaceholder('搜索 skill...')).toBeVisible()
    }

    const textLength = await page.evaluate(() => document.body.innerText.length)
    expect(textLength).toBeGreaterThan(20)
  })
})

