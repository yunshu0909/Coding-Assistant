/**
 * V1.9.9 Claude 自定义 statusLine 后端保护测试
 *
 * @module 自动化测试/V1.9.9/tests/quota/claudeStatusLineOwnership.test
 */

import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

const require = createRequire(import.meta.url)

async function pathExists(checkPath) {
  try {
    await fs.access(checkPath)
    return true
  } catch {
    return false
  }
}

function loadModuleWithHome(tempHome) {
  process.env.HOME = tempHome
  process.env.USERPROFILE = tempHome
  process.env.PATH = '/nonexistent'
  for (const modulePath of [
    require.resolve('../../../../electron/services/claudeUsageStatusService'),
    require.resolve('../../../../electron/services/claudeSettingsService'),
  ]) {
    delete require.cache[modulePath]
  }
  return require('../../../../electron/services/claudeUsageStatusService')
}

function createSettingsService(settingsPath, onWrite = () => {}) {
  return {
    async readClaudeSettingsFile() {
      const content = await fs.readFile(settingsPath, 'utf8')
      return { success: true, exists: true, content, data: JSON.parse(content) }
    },
    async writeClaudeSettingsFile(data, options) {
      onWrite(data, options)
      await fs.writeFile(settingsPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
      return { success: true }
    },
  }
}

describe.sequential('V1.9.9 Claude statusLine ownership', () => {
  let tempHome
  let settingsPath
  let originalEnv

  beforeEach(async () => {
    originalEnv = {
      HOME: process.env.HOME,
      USERPROFILE: process.env.USERPROFILE,
      PATH: process.env.PATH,
    }
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codepal-statusline-ownership-'))
    settingsPath = path.join(tempHome, '.claude', 'settings.json')
    await fs.mkdir(path.dirname(settingsPath), { recursive: true })
  })

  afterEach(async () => {
    process.env.HOME = originalEnv.HOME
    process.env.USERPROFILE = originalEnv.USERPROFILE
    process.env.PATH = originalEnv.PATH
    await fs.rm(tempHome, { recursive: true, force: true })
  })

  it('Q-TC-09: 未确认时不覆盖自定义 statusLine', async () => {
    const customSettings = {
      statusLine: { type: 'command', command: 'bash "/tmp/my-statusline.sh"' },
    }
    await fs.writeFile(settingsPath, `${JSON.stringify(customSettings, null, 2)}\n`, 'utf8')
    const moduleUnderTest = loadModuleWithHome(tempHome)
    const service = moduleUnderTest.createClaudeUsageStatusService({
      pathExists,
      claudeSettingsService: createSettingsService(settingsPath),
    })

    const result = await service.ensureUsageStatusInstalled({ force: false })
    const after = JSON.parse(await fs.readFile(settingsPath, 'utf8'))

    expect(result.integrationState).toBe('conflict')
    expect(after.statusLine.command).toBe('bash "/tmp/my-statusline.sh"')
  })

  it('Q-TC-09b: 明确确认后携带原内容请求备份再接管', async () => {
    const originalContent = `${JSON.stringify({
      statusLine: { type: 'command', command: 'bash "/tmp/my-statusline.sh"' },
    }, null, 2)}\n`
    await fs.writeFile(settingsPath, originalContent, 'utf8')
    const writes = []
    const moduleUnderTest = loadModuleWithHome(tempHome)
    const service = moduleUnderTest.createClaudeUsageStatusService({
      pathExists,
      claudeSettingsService: createSettingsService(settingsPath, (data, options) => writes.push({ data, options })),
    })

    const result = await service.ensureUsageStatusInstalled({ force: true })

    expect(result.success).toBe(true)
    expect(writes).toHaveLength(1)
    expect(writes[0].options.backupSuffix).toBe('codepal-usage-status')
    expect(writes[0].options.previousContent).toBe(originalContent)
    expect(writes[0].data.statusLine.command).toBe(moduleUnderTest.MANAGED_STATUS_COMMAND)
  })
})
