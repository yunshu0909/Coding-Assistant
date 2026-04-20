/**
 * V1.6.0 · v1.7 追加:terminal-preview IPC handler 单元测试
 *
 * 覆盖 pty 生命周期(start / write / resize / stop)的 IPC 交互。
 * node-pty 被 vi.mock 替换,不真的 spawn claude。
 *
 * 主要验证的行为:
 * - start 触发 pty.spawn('claude', ['--bare'], ...) 用正确的 TERM/COLORTERM
 * - write 把数据转发到 ptyProcess.write
 * - resize 转发到 ptyProcess.resize
 * - stop 调用 ptyProcess.kill
 * - ptyProcess.onData 把数据推给 renderer (webContents.send)
 * - 重复 start 先清理旧 pty 再开新的
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as handler from '../../electron/handlers/registerTerminalPreviewHandlers.js'

const { registerTerminalPreviewHandlers, cleanupTerminalPreview, __setPty } = handler

const spawnMock = vi.fn()

describe('registerTerminalPreviewHandlers', () => {
  let ipcHandlers
  let ipcMain
  let win
  let getMainWindow
  let mockPty
  let onDataCb
  let onExitCb

  beforeEach(() => {
    cleanupTerminalPreview()
    ipcHandlers = {}
    ipcMain = {
      on: (channel, cb) => { ipcHandlers[channel] = cb },
    }
    win = {
      isDestroyed: () => false,
      webContents: { send: vi.fn() },
    }
    getMainWindow = () => win

    onDataCb = null
    onExitCb = null
    mockPty = {
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn((cb) => { onDataCb = cb }),
      onExit: vi.fn((cb) => { onExitCb = cb }),
    }
    spawnMock.mockReset()
    spawnMock.mockReturnValue(mockPty)

    // 通过注入钩子替换 pty(避开 CJS require 的 vi.mock 兼容问题)
    __setPty({ spawn: spawnMock })
    registerTerminalPreviewHandlers({ ipcMain, getMainWindow })
  })

  describe('start', () => {
    it('触发 pty.spawn(claude --bare) 用 xterm-256color + truecolor 环境', () => {
      ipcHandlers['terminal-preview:start'](null, { cols: 120, rows: 36 })

      expect(spawnMock).toHaveBeenCalledOnce()
      const [cmd, args, opts] = spawnMock.mock.calls[0]
      expect(cmd).toBe('claude')
      expect(args).toEqual(['--bare'])
      expect(opts.cols).toBe(120)
      expect(opts.rows).toBe(36)
      expect(opts.name).toBe('xterm-256color')
      expect(opts.env.TERM).toBe('xterm-256color')
      expect(opts.env.COLORTERM).toBe('truecolor')
    })

    it('默认 cols/rows 为 100×32', () => {
      ipcHandlers['terminal-preview:start'](null, {})
      const opts = spawnMock.mock.calls[0][2]
      expect(opts.cols).toBe(100)
      expect(opts.rows).toBe(32)
    })

    it('onData 推数据到 renderer(webContents.send terminal-preview:data)', () => {
      ipcHandlers['terminal-preview:start'](null, {})
      // 模拟 pty 吐数据
      onDataCb('Welcome back!')
      expect(win.webContents.send).toHaveBeenCalledWith('terminal-preview:data', 'Welcome back!')
    })

    it('onExit 推 exit 事件到 renderer', () => {
      ipcHandlers['terminal-preview:start'](null, {})
      onExitCb()
      // sendTo 会带第二个 payload 参数(这里是 undefined,因为 exit 不带数据)
      expect(win.webContents.send).toHaveBeenCalledWith('terminal-preview:exit', undefined)
    })

    it('重复 start:先 kill 旧 pty 再 spawn 新的', () => {
      ipcHandlers['terminal-preview:start'](null, {})
      const firstPty = mockPty

      // 造一个新的 pty 替换返回值
      const secondPty = {
        write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
        onData: vi.fn(), onExit: vi.fn(),
      }
      spawnMock.mockReturnValueOnce(secondPty)

      ipcHandlers['terminal-preview:start'](null, {})
      expect(firstPty.kill).toHaveBeenCalledOnce()
      expect(spawnMock).toHaveBeenCalledTimes(2)
    })

    it('pty.spawn 抛错 → 推 error 事件,不崩溃', () => {
      spawnMock.mockImplementationOnce(() => { throw new Error('claude not found') })
      expect(() => ipcHandlers['terminal-preview:start'](null, {})).not.toThrow()
      expect(win.webContents.send).toHaveBeenCalledWith(
        'terminal-preview:error',
        expect.stringContaining('claude not found'),
      )
    })
  })

  describe('write', () => {
    it('转发输入到 ptyProcess.write', () => {
      ipcHandlers['terminal-preview:start'](null, {})
      ipcHandlers['terminal-preview:write'](null, '1\r')
      expect(mockPty.write).toHaveBeenCalledWith('1\r')
    })

    it('没启动 pty 时 write 静默忽略,不崩', () => {
      expect(() => ipcHandlers['terminal-preview:write'](null, 'hello')).not.toThrow()
      expect(mockPty.write).not.toHaveBeenCalled()
    })
  })

  describe('resize', () => {
    it('转发到 ptyProcess.resize(cols, rows)', () => {
      ipcHandlers['terminal-preview:start'](null, {})
      ipcHandlers['terminal-preview:resize'](null, { cols: 140, rows: 40 })
      expect(mockPty.resize).toHaveBeenCalledWith(140, 40)
    })

    it('非法 cols/rows 静默忽略', () => {
      ipcHandlers['terminal-preview:start'](null, {})
      ipcHandlers['terminal-preview:resize'](null, { cols: 0, rows: -1 })
      expect(mockPty.resize).not.toHaveBeenCalled()
    })
  })

  describe('stop', () => {
    it('调用 kill 并清空状态', () => {
      ipcHandlers['terminal-preview:start'](null, {})
      ipcHandlers['terminal-preview:stop']()
      expect(mockPty.kill).toHaveBeenCalledOnce()

      // stop 后再 write 应该静默
      ipcHandlers['terminal-preview:write'](null, 'x')
      expect(mockPty.write).not.toHaveBeenCalled()
    })
  })

  describe('cleanup', () => {
    it('cleanupTerminalPreview 在模块卸载时 kill 当前 pty', () => {
      ipcHandlers['terminal-preview:start'](null, {})
      cleanupTerminalPreview()
      expect(mockPty.kill).toHaveBeenCalledOnce()
    })
  })
})
