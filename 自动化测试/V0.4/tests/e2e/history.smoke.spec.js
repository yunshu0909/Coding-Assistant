/**
 * V0.4 历史回归 E2E 冒烟
 *
 * 负责：
 * - 验证应用首屏可用（导入页或工作台）
 * - 验证导入页与管理页的关键可交互路径
 * - 防止壳子升级影响 V0.1~V0.4 主流程入口
 *
 * @module auto-test/v04/e2e/history-smoke
 */

const { test, expect } = require('@playwright/test')
const { _electron: electron } = require('playwright')

async function isWorkbenchMode(page) {
  const skillNavCount = await page.getByRole('button', { name: '技能管理' }).count()
  return skillNavCount > 0
}

test.describe('V0.4 Historical Regression E2E', () => {
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

  test('E2E-01: 首屏渲染可用（导入页或工作台）', async () => {
    const workbench = await isWorkbenchMode(page)

    if (workbench) {
      await expect(page.getByRole('button', { name: '技能管理' })).toBeVisible()
      await expect(page.getByRole('button', { name: '用量监测' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Skill Manager' })).toBeVisible()
      return
    }

    await expect(page.getByText('选择要管理的工具')).toBeVisible()
    await expect(page.getByRole('button', { name: '一键导入' })).toBeVisible()
  })

  test('E2E-02: 导入页与管理页关键入口可交互', async () => {
    const workbench = await isWorkbenchMode(page)

    if (workbench) {
      await page.getByRole('button', { name: '配置' }).click()
      await expect(page.getByRole('heading', { name: '配置' })).toBeVisible()
      await expect(page.getByRole('button', { name: '保存配置' })).toBeVisible()
      await page.getByRole('button', { name: '返回' }).click()
      await expect(page.getByRole('heading', { name: 'Skill Manager' })).toBeVisible()
      return
    }

    const importButton = page.getByRole('button', { name: '一键导入' })
    await expect(importButton).toBeDisabled()

    const firstToolCard = page.locator('.tool-card').first()
    await firstToolCard.click()
    await expect(importButton).toBeEnabled()
  })

  test('E2E-03: 历史主路径基础元素稳定可见', async () => {
    const workbench = await isWorkbenchMode(page)

    if (workbench) {
      await expect(page.getByPlaceholder('搜索 skill...')).toBeVisible()
      await expect(page.getByText('点击行选择 · 点击状态标签切换 · 选中后批量操作')).toBeVisible()
      return
    }

    await expect(page.getByText('中央仓库')).toBeVisible()
    await expect(page.getByRole('button', { name: '更改位置' })).toBeVisible()
  })
})
