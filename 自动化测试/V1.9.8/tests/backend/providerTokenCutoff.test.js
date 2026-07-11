/**
 * V1.9.8 provider 断接线 — 静态守卫测试
 *
 * 负责：
 * - 防退化：确保 6 个 provider IPC 不再暴露给渲染层、主进程不再注册 provider handlers
 * - 可恢复性：确保代码完整保留在 _disabled/api-config/
 *
 * 说明：断接线后「renderer 拿不到真实 token」的最终验证是源码级——通道不存在即不可达。
 *
 * @module 自动化测试/V1.9.8/tests/backend/providerTokenCutoff.test
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8')
const exists = (p) => fs.existsSync(path.join(ROOT, p))

const REMOVED_CHANNELS = [
  'get-claude-provider',
  'list-provider-definitions',
  'register-provider-manifest',
  'get-provider-env-config',
  'save-provider-token',
  'switch-claude-provider',
]

describe('V1.9.8 provider 断接线静态守卫', () => {
  it('PT-1: preload.js 不再暴露任何 provider 通道', () => {
    const preload = read('electron/preload.js')
    for (const channel of REMOVED_CHANNELS) {
      expect(preload.includes(channel), `preload 仍含通道 ${channel}`).toBe(false)
    }
  })

  it('PT-2: main.js 不再引用 registerProviderHandlers', () => {
    const main = read('electron/main.js')
    expect(main.includes('registerProviderHandlers')).toBe(false)
  })

  it('PT-3: App.jsx 无 ApiConfigPage 路由，VALID_ACTIVE_MODULES 无 api', () => {
    const app = read('src/App.jsx')
    expect(app.includes('ApiConfigPage')).toBe(false)
    expect(/VALID_ACTIVE_MODULES = new Set\(\[[^\]]*'api'/.test(app)).toBe(false)
  })

  it('PT-4: 代码完整保留在 _disabled/api-config/（可恢复）', () => {
    expect(exists('_disabled/api-config/README.md')).toBe(true)
    expect(exists('_disabled/api-config/src/pages/ApiConfigPage.jsx')).toBe(true)
    expect(exists('_disabled/api-config/electron/handlers/registerProviderHandlers.js')).toBe(true)
    expect(exists('_disabled/api-config/electron/services/providerSwitchService.js')).toBe(true)
  })

  it('PT-5: 原位文件已不存在（不会被打包）', () => {
    expect(exists('src/pages/ApiConfigPage.jsx')).toBe(false)
    expect(exists('electron/handlers/registerProviderHandlers.js')).toBe(false)
    expect(exists('electron/services/providerSwitchService.js')).toBe(false)
  })

  it('PT-6: 其他模块依赖的服务未被误搬（providerRegistryService/envFileService 原位）', () => {
    expect(exists('electron/services/providerRegistryService.js')).toBe(true)
    expect(exists('electron/services/envFileService.js')).toBe(true)
    expect(exists('electron/services/claudeSettingsService.js')).toBe(true)
  })
})
