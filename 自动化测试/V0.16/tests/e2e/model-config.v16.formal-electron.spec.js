/**
 * V0.16 模型配置与推理等级正式版 E2E 测试
 *
 * 负责：
 * - 在真实 Electron 环境验证模型配置 Tab 主流程
 * - 验证 settings.json 在真实文件系统中的写入结果
 * - 验证读取失败重试链路
 *
 * @module 自动化测试/V0.16/tests/e2e/model-config.v16.formal-electron.spec
 */

const { test, expect } = require('@playwright/test')
const { _electron: electron } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')

/**
 * 预置中央仓库 skill，确保应用稳定进入工作台
 * @param {string} homeDir - 测试 HOME 路径
 * @returns {Promise<void>}
 */
async function seedCentralRepo(homeDir) {
  const skillDir = path.join(homeDir, 'Documents', 'SkillManager', 'seed-skill')
  await fs.mkdir(skillDir, { recursive: true })
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# Seed Skill\n用于 V0.16 E2E 启动\n', 'utf-8')
}

/**
 * 写入 settings.json
 * @param {string} settingsPath - settings 文件路径
 * @param {string|object} data - 写入数据
 * @returns {Promise<void>}
 */
async function writeSettings(settingsPath, data) {
  await fs.mkdir(path.dirname(settingsPath), { recursive: true })
  const content = typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`
  await fs.writeFile(settingsPath, content, 'utf-8')
}

/**
 * 打开启动模式页面
 * @param {import('@playwright/test').Page} page - 当前窗口
 * @returns {Promise<void>}
 */
async function openPermissionModePage(page) {
  await page.getByRole('button', { name: /启动模式/ }).click()
  await expect(page.locator('.page-shell__title')).toContainText('启动模式')
}

/**
 * 打开模型配置 Tab
 * @param {import('@playwright/test').Page} page - 当前窗口
 * @returns {Promise<void>}
 */
async function openModelConfigTab(page) {
  await page.getByRole('button', { name: '模型配置与推理等级' }).click()
  await expect(page.getByTestId('model-status-card')).toBeVisible()
}

/**
 * 刷新并进入模型配置 Tab
 * @param {import('@playwright/test').Page} page - 当前窗口
 * @returns {Promise<void>}
 */
async function reloadAndOpenModelConfigTab(page) {
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await openPermissionModePage(page)
  await openModelConfigTab(page)
}

test.describe('V0.16 Model Config Formal E2E (Electron)', () => {
  let electronApp
  let page
  let tempHome
  let settingsPath

  test.beforeAll(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'v16-model-config-e2e-'))
    settingsPath = path.join(tempHome, '.claude', 'settings.json')

    await seedCentralRepo(tempHome)

    test.setTimeout(90000)
    electronApp = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        HOME: tempHome,
      },
      timeout: 90000,
    })

    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close()
    }
    if (tempHome) {
      await fs.rm(tempHome, { recursive: true, force: true })
    }
  })

  test('TC-E2E-01: 未配置态可完成预设模型与推理等级切换并落盘', async () => {
    await fs.rm(settingsPath, { force: true })

    await reloadAndOpenModelConfigTab(page)

    await expect(page.getByTestId('model-status-card')).toContainText('Default')
    await expect(page.getByTestId('model-status-card')).toContainText('中')

    await page.getByTestId('model-radio-sonnet').click()
    await expect(page.getByText('已切换默认模型为「Sonnet」')).toBeVisible()

    await page.getByTestId('effort-radio-high').click()
    await expect(page.getByText('已切换推理等级为「高」')).toBeVisible()

    const parsed = JSON.parse(await fs.readFile(settingsPath, 'utf-8'))
    expect(parsed.model).toBe('sonnet')
    expect(parsed.effortLevel).toBe('high')
  })

  test('TC-E2E-02: 应用自定义模型后状态卡显示原始值且预设不高亮', async () => {
    await writeSettings(settingsPath, {
      model: 'opus',
      effortLevel: 'medium',
      permissions: { defaultMode: 'default' },
    })

    await reloadAndOpenModelConfigTab(page)

    await page.getByTestId('model-custom-input').fill('claude-opus-4-6')
    await page.getByTestId('model-custom-apply').click()
    await expect(page.getByText('已切换默认模型为「claude-opus-4-6」')).toBeVisible()
    await expect(page.getByTestId('model-status-card')).toContainText('claude-opus-4-6')
    await expect(page.locator('[data-testid^="model-radio-"].is-selected')).toHaveCount(0)

    const parsed = JSON.parse(await fs.readFile(settingsPath, 'utf-8'))
    expect(parsed.model).toBe('claude-opus-4-6')
    expect(parsed.effortLevel).toBe('medium')
    expect(parsed.permissions.defaultMode).toBe('default')
  })

  test('TC-E2E-03: JSON 解析错误可通过重试恢复', async () => {
    await writeSettings(settingsPath, '{"model":"sonnet", }')

    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await openPermissionModePage(page)
    await page.getByRole('button', { name: '模型配置与推理等级' }).click()

    await expect(page.getByText(/JSON 解析错误/)).toBeVisible()

    // 点击重试前修复文件，验证重试会重新读取并恢复正常态。
    await writeSettings(settingsPath, {
      model: 'haiku',
      effortLevel: 'low',
    })

    await page.getByRole('button', { name: '重试' }).click()
    await expect(page.getByTestId('model-status-card')).toBeVisible()
    await expect(page.getByTestId('model-status-card')).toContainText('Haiku')
    await expect(page.getByTestId('model-status-card')).toContainText('低')
  })
})
