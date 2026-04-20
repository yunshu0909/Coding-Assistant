/**
 * V1.6.0 terminalThemeService 单元测试
 *
 * 覆盖：
 * - listThemes:返回 6 套内置主题 + 当前默认
 * - readCurrentDefault:无值时返回 null
 * - setDefault:已装 → 直接写 plist + killall;未装 → open 导入 + 延时 + 写 plist
 * - restoreSystemDefault:固定写 "Clear Dark"
 * - ensureThemeImported:预估 key 匹配成功时不重复导入
 *
 * 所有外部命令通过 __setExecFile 注入 mock,不真碰系统 plist。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import * as svc from '../../electron/services/terminalThemeService'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REAL_THEME_DIR = resolve(__dirname, '../../electron/resources/terminal-themes')

describe('terminalThemeService', () => {
  let mockExec
  let calls

  beforeEach(() => {
    svc.__reset()
    calls = []
    mockExec = vi.fn((cmd, args) => {
      calls.push({ cmd, args })
      // 默认:defaults read Default Window Settings 返回 "Clear Dark"
      if (cmd === 'defaults' && args[0] === 'read' && args[2] === 'Default Window Settings') {
        return Promise.resolve({ stdout: 'Clear Dark\n' })
      }
      // defaults read Window Settings(列主题库) — 默认空
      if (cmd === 'defaults' && args[0] === 'read' && args[2] === 'Window Settings') {
        return Promise.resolve({ stdout: '{\n    "Clear Dark" = { ... };\n}\n' })
      }
      // 其他默认 resolve 空
      return Promise.resolve({ stdout: '' })
    })
    svc.__setExecFile(mockExec)
  })

  describe('listThemes', () => {
    it('返回 3 套内置主题 + 2 浅 + 1 深分组', async () => {
      const result = await svc.listThemes()
      expect(result.themes).toHaveLength(3)
      const light = result.themes.filter((t) => !t.isDark)
      const dark = result.themes.filter((t) => t.isDark)
      expect(light).toHaveLength(2)
      expect(dark).toHaveLength(1)
    })

    it('所有主题都有色值元数据', async () => {
      const { themes } = await svc.listThemes()
      for (const t of themes) {
        expect(t.colors.bg).toMatch(/^#[0-9A-F]{6}$/i)
        expect(t.colors.fg).toMatch(/^#[0-9A-F]{6}$/i)
        expect(t.colors.ansi.red).toBeDefined()
        expect(t.colors.ansi.green).toBeDefined()
        expect(t.colors.syntax.keyword).toBeDefined()
      }
    })

    it('每个主题都有 predictedSystemKey(name 去空格)', async () => {
      const { themes } = await svc.listThemes()
      const expected = {
        'solarized-light': 'SolarizedLight',
        'notion-white': 'NotionWhite',
        'dracula': 'Dracula',
      }
      for (const t of themes) {
        expect(t.predictedSystemKey).toBe(expected[t.id])
      }
    })

    it('currentDefault 返回系统当前默认', async () => {
      const result = await svc.listThemes()
      expect(result.currentDefault).toBe('Clear Dark')
    })
  })

  describe('readCurrentDefault', () => {
    it('defaults 读取失败时返回 null', async () => {
      svc.__setExecFile(() => Promise.reject(new Error('not set')))
      const result = await svc.readCurrentDefault()
      expect(result).toBeNull()
    })

    it('空字符串 trim 后也返回 null', async () => {
      svc.__setExecFile(() => Promise.resolve({ stdout: '   \n' }))
      const result = await svc.readCurrentDefault()
      expect(result).toBeNull()
    })
  })

  describe('setDefault', () => {
    it('未知 themeId 抛 UNKNOWN_THEME', async () => {
      await expect(svc.setDefault('nope')).rejects.toThrow(/UNKNOWN_THEME/)
    })

    it('主题已装(isThemeInstalled 为 true)时直接写 plist,不 open', async () => {
      // mock Window Settings 里已有 Dracula
      svc.__setExecFile((cmd, args) => {
        calls.push({ cmd, args })
        if (cmd === 'defaults' && args[0] === 'read' && args[2] === 'Window Settings') {
          return Promise.resolve({ stdout: '{\n    Dracula = {};\n}\n' })
        }
        return Promise.resolve({ stdout: '' })
      })

      const result = await svc.setDefault('dracula')

      expect(result.appliedKey).toBe('Dracula')
      // 不应有 open 命令被调用
      const openCalls = calls.filter((c) => c.cmd === 'open')
      expect(openCalls).toHaveLength(0)
      // 应有 2 个 defaults write (Default + Startup)
      const writeCalls = calls.filter((c) => c.cmd === 'defaults' && c.args[0] === 'write')
      expect(writeCalls).toHaveLength(2)
      expect(writeCalls[0].args).toContain('Default Window Settings')
      expect(writeCalls[0].args).toContain('Dracula')
      // 应有 1 个 killall cfprefsd
      const killallCalls = calls.filter((c) => c.cmd === 'killall')
      expect(killallCalls).toHaveLength(1)
      expect(killallCalls[0].args).toEqual(['cfprefsd'])
    })

    it('主题未装时先调 open -a Terminal 导入', async () => {
      let readCallIdx = 0
      svc.__setExecFile((cmd, args) => {
        calls.push({ cmd, args })
        if (cmd === 'defaults' && args[0] === 'read' && args[2] === 'Window Settings') {
          readCallIdx++
          // 第 1 次读:没有 SolarizedLight;第 2 次(导入后)有
          if (readCallIdx === 1) {
            return Promise.resolve({ stdout: '{\n    Basic = {};\n}\n' })
          }
          return Promise.resolve({ stdout: '{\n    Basic = {};\n    SolarizedLight = {};\n}\n' })
        }
        return Promise.resolve({ stdout: '' })
      })

      const result = await svc.setDefault('solarized-light')

      expect(result.appliedKey).toBe('SolarizedLight')
      const openCalls = calls.filter((c) => c.cmd === 'open')
      expect(openCalls).toHaveLength(1)
      expect(openCalls[0].args[0]).toBe('-a')
      expect(openCalls[0].args[1]).toBe('Terminal')
      expect(openCalls[0].args[2]).toMatch(/SolarizedLight\.terminal$/)
    })

    it('导入后会使用 plist 里的真实 key，而不是死信 predictedSystemKey', async () => {
      // 场景:Terminal.app 某次导入没按常规去空格,真实 key 仍带空格 "Solarized Light"
      // 服务应该按真实 plist key 写入,不死信 predictedSystemKey "SolarizedLight"
      let readCallIdx = 0
      svc.__setExecFile((cmd, args) => {
        calls.push({ cmd, args })
        if (cmd === 'defaults' && args[0] === 'read' && args[2] === 'Window Settings') {
          readCallIdx++
          if (readCallIdx === 1) {
            return Promise.resolve({ stdout: '{\n    Basic = {};\n}\n' })
          }
          return Promise.resolve({ stdout: '{\n    "Solarized Light" = {};\n}\n' })
        }
        return Promise.resolve({ stdout: '' })
      })

      const result = await svc.setDefault('solarized-light')

      expect(result.appliedKey).toBe('Solarized Light')
      const writeCalls = calls.filter((c) => c.cmd === 'defaults' && c.args[0] === 'write')
      expect(writeCalls[0].args).toContain('Solarized Light')
      expect(writeCalls[1].args).toContain('Solarized Light')
    })

    it('killall cfprefsd 失败不影响整体成功', async () => {
      svc.__setExecFile((cmd, args) => {
        calls.push({ cmd, args })
        if (cmd === 'killall') return Promise.reject(new Error('no process'))
        if (cmd === 'defaults' && args[0] === 'read' && args[2] === 'Window Settings') {
          return Promise.resolve({ stdout: '{\n    Dracula = {};\n}\n' })
        }
        return Promise.resolve({ stdout: '' })
      })

      const result = await svc.setDefault('dracula')
      expect(result.appliedKey).toBe('Dracula')  // killall 失败也应返回成功
    })
  })

  describe('restoreSystemDefault', () => {
    it('固定写 "Clear Dark"', async () => {
      const result = await svc.restoreSystemDefault()
      expect(result.appliedKey).toBe('Clear Dark')
      const writeCalls = calls.filter((c) => c.cmd === 'defaults' && c.args[0] === 'write')
      expect(writeCalls).toHaveLength(2)
      for (const c of writeCalls) {
        expect(c.args).toContain('Clear Dark')
      }
      // 必须 killall cfprefsd
      const killallCalls = calls.filter((c) => c.cmd === 'killall')
      expect(killallCalls).toHaveLength(1)
    })
  })

  describe('getResourcesDir（环境判断）', () => {
    // 这组 case 专门防回归之前那个 bug:
    // 旧代码用 `process.resourcesPath.includes('.app')` 判断 isPackaged,
    // 但 electron dev 模式下 process.resourcesPath 也包含 .app
    // (指向 node_modules/electron/dist/Electron.app),误判成生产环境导致 ENOENT。
    // 修复后应该直接看源码目录的 themes-meta.json 存不存在。

    it('dev 环境 (process.resourcesPath 有值但源码目录能读到) → 走源码路径', async () => {
      // 模拟 electron dev:process.resourcesPath 是一个带 .app 的路径
      const origRP = process.resourcesPath
      Object.defineProperty(process, 'resourcesPath', {
        value: '/fake/node_modules/electron/dist/Electron.app/Contents/Resources',
        configurable: true,
      })
      try {
        svc.__reset()
        svc.__setExecFile(mockExec)
        const result = await svc.listThemes()
        // 若走了 prod 分支,themes-meta.json 读不到会直接抛错
        expect(result.themes).toHaveLength(3)
      } finally {
        Object.defineProperty(process, 'resourcesPath', {
          value: origRP, configurable: true,
        })
      }
    })

    it('真·生产环境 (process.resourcesPath 有 terminal-themes 子目录) → 应走 prod 路径', async () => {
      // 用真实资源目录模拟 prod 子目录，避免 async 函数落成 unhandled rejection
      const origRP = process.resourcesPath
      Object.defineProperty(process, 'resourcesPath', {
        value: '/fake/prod/Resources', configurable: true,
      })
      try {
        svc.__reset()
        svc.__setResourcesDir(REAL_THEME_DIR)
        svc.__setExecFile(mockExec)
        const result = await svc.listThemes()
        expect(result.themes).toHaveLength(3)
      } finally {
        Object.defineProperty(process, 'resourcesPath', {
          value: origRP, configurable: true,
        })
      }
    })
  })

  describe('isThemeInstalled', () => {
    it('匹配带引号的 key: "SolarizedLight" =', async () => {
      svc.__setExecFile(() => Promise.resolve({
        stdout: '{\n    "Clear Dark" = { ... };\n    "SolarizedLight" = { ... };\n}\n',
      }))
      expect(await svc.isThemeInstalled('SolarizedLight')).toBe(true)
      expect(await svc.isThemeInstalled('DoesNotExist')).toBe(false)
    })

    it('匹配不带引号的 key: Dracula =', async () => {
      svc.__setExecFile(() => Promise.resolve({
        stdout: '{\n    Basic = { ... };\n    Dracula = { ... };\n}\n',
      }))
      expect(await svc.isThemeInstalled('Dracula')).toBe(true)
    })

    it('读取失败时返回 false', async () => {
      svc.__setExecFile(() => Promise.reject(new Error('no plist')))
      expect(await svc.isThemeInstalled('Dracula')).toBe(false)
    })
  })
})
