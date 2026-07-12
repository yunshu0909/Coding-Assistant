/**
 * V1.9.11 满载率趋势下线回归测试
 *
 * @module 自动化测试/V1.9.11/tests/usageTrendRemoval.test
 */

import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import ClaudeUsageStatusPage from '../../../src/pages/ClaudeUsageStatusPage'

const readSource = (relativePath) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('V1.9.11 满载率趋势下线', () => {
  it('RM-TC-01: UI、IPC 与服务层不再保留趋势取数入口', () => {
    const page = readSource('src/pages/ClaudeUsageStatusPage.jsx')
    const claudeHook = readSource('src/pages/usage/useClaudeUsageStatus.js')
    const codexHook = readSource('src/pages/usage/useCodexUsageStatus.js')
    const preload = readSource('electron/preload.js')
    const claudeHandlers = readSource('electron/handlers/registerClaudeUsageStatusHandlers.js')
    const codexHandlers = readSource('electron/handlers/registerCodexUsageStatusHandlers.js')
    const codexService = readSource('electron/services/codexUsageStatusService.js')

    expect(page).not.toContain('DualTrendCard')
    expect(page).not.toContain('满载率趋势')
    expect(claudeHook).not.toContain('getClaudeUsageHistory')
    expect(codexHook).not.toContain('getCodexUsageTrend')
    expect(preload).not.toContain('getClaudeUsageHistory')
    expect(preload).not.toContain('getCodexUsageTrend')
    expect(claudeHandlers).not.toContain('claude-usage-status:get-history')
    expect(codexHandlers).not.toContain('codex-usage-status:get-trend')
    expect(codexService).not.toContain('getCodexUsageTrend')
    expect(codexService).not.toContain('TREND_LOOKBACK_DAYS')
  })

  it('RM-TC-02: statusLine 升级后停止写历史，但继续生成当前额度脚本', () => {
    const service = readSource('electron/services/claudeUsageStatusService.js')
    const template = readSource('electron/services/claudeUsageStatusScript.tpl')

    expect(service).toContain('const SCRIPT_VERSION = 8')
    expect(service).not.toContain('STATUS_HISTORY_PATH')
    expect(service).not.toContain('getUsageHistory')
    expect(template).not.toContain('__HISTORY_PATH__')
    expect(template).not.toContain('update_history')
    expect(template).toContain('write_snapshot(snapshot)')
  })

  it('RM-TC-03: 页面只请求当前额度，Claude/Codex 双栏继续展示', async () => {
    const now = Math.floor(Date.now() / 1000)
    const getClaudeUsageHistory = vi.fn()
    const getCodexUsageTrend = vi.fn()
    window.electronAPI = {
      getClaudeUsageStatusState: vi.fn().mockResolvedValue({
        success: true,
        integrationState: 'ready',
        claudeInstalled: true,
        usesManagedStatusLine: true,
        scriptOutdated: false,
        config: { displayMode: 'always', fiveHourThreshold: 70, sevenDayThreshold: 70 },
        snapshot: {
          hasRateLimits: true,
          fiveHourUsedPercentage: 21,
          sevenDayUsedPercentage: 34,
          resetsAt: now + 3600,
          sevenDayResetsAt: now + 86400,
          updatedAt: now,
        },
      }),
      getCodexUsageStatusState: vi.fn().mockResolvedValue({
        success: true,
        integrationState: 'ready',
        snapshot: {
          hasRateLimits: true,
          fiveHourUsedPercentage: 13,
          sevenDayUsedPercentage: 55,
          resetsAt: now + 1800,
          sevenDayResetsAt: now + 7200,
          updatedAt: now,
        },
      }),
      getClaudeUsageHistory,
      getCodexUsageTrend,
    }

    render(<ClaudeUsageStatusPage />)

    await waitFor(() => {
      expect(window.electronAPI.getClaudeUsageStatusState).toHaveBeenCalledTimes(1)
      expect(window.electronAPI.getCodexUsageStatusState).toHaveBeenCalledTimes(1)
    })
    expect(screen.getAllByText('5 小时额度')).toHaveLength(2)
    expect(screen.getAllByText('7 天额度')).toHaveLength(2)
    expect(screen.queryByText('满载率趋势')).toBeNull()
    expect(getClaudeUsageHistory).not.toHaveBeenCalled()
    expect(getCodexUsageTrend).not.toHaveBeenCalled()
  })
})

