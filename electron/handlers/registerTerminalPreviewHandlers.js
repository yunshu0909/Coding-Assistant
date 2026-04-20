/**
 * 终端外观预览的 pty 管理
 *
 * 负责：
 * - 为「终端外观」页面 spawn `claude --bare` 到 pty
 * - 把 Claude Code 的 stdout 通过 IPC 推给 renderer 的 xterm.js
 * - 接收 renderer 的 resize / kill 请求
 * - 离开页面 / 应用退出时清理 pty
 *
 * 关键:用户不输入消息 → 不触发 API 请求 → 0 quota 消耗
 *
 * @module electron/handlers/registerTerminalPreviewHandlers
 */

let pty = null
try {
  pty = require('node-pty')
} catch (err) {
  // native module load 失败(极少见,通常是 rebuild 没做)
  console.warn('[terminal-preview] node-pty 加载失败:', err?.message || err)
}

// 测试钩子:注入 pty mock
function __setPty(mockPty) { pty = mockPty }

let ptyProcess = null

/**
 * 注册终端外观预览相关 IPC
 * @param {object} deps
 * @param {import('electron').IpcMain} deps.ipcMain
 * @param {() => import('electron').BrowserWindow | null} deps.getMainWindow
 */
function registerTerminalPreviewHandlers({ ipcMain, getMainWindow }) {
  ipcMain.on('terminal-preview:start', (_e, opts = {}) => {
    if (!pty) {
      sendTo(getMainWindow(), 'terminal-preview:error', 'node-pty 未安装(请 rebuild)')
      return
    }
    // 已有实例先清理
    killCurrent()

    const cols = opts.cols || 100
    const rows = opts.rows || 32
    const win = typeof getMainWindow === 'function' ? getMainWindow() : null
    if (!win) return

    try {
      ptyProcess = pty.spawn('claude', ['--bare'], {
        name: 'xterm-256color',
        cols, rows,
        cwd: process.env.HOME,
        env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
      })
      ptyProcess.onData((data) => {
        sendTo(win, 'terminal-preview:data', data)
      })
      ptyProcess.onExit(() => {
        sendTo(win, 'terminal-preview:exit')
        ptyProcess = null
      })
    } catch (err) {
      sendTo(win, 'terminal-preview:error', err?.message || String(err))
      ptyProcess = null
    }
  })

  ipcMain.on('terminal-preview:write', (_e, data) => {
    if (!ptyProcess) return
    try { ptyProcess.write(data) } catch {}
  })

  ipcMain.on('terminal-preview:resize', (_e, opts = {}) => {
    if (!ptyProcess) return
    const cols = Number(opts.cols) || 0
    const rows = Number(opts.rows) || 0
    if (cols > 0 && rows > 0) {
      try { ptyProcess.resize(cols, rows) } catch {}
    }
  })

  ipcMain.on('terminal-preview:stop', () => {
    killCurrent()
  })
}

function killCurrent() {
  if (ptyProcess) {
    try { ptyProcess.kill() } catch {}
    ptyProcess = null
  }
}

function sendTo(win, channel, payload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload)
  }
}

/** 应用退出时调,确保 pty 清理 */
function cleanupTerminalPreview() {
  killCurrent()
}

module.exports = {
  registerTerminalPreviewHandlers,
  cleanupTerminalPreview,
  __setPty,
}
