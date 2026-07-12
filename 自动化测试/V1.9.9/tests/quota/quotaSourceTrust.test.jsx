/**
 * V1.9.9 会员额度来源、新鲜度与接管确认测试
 *
 * @module 自动化测试/V1.9.9/tests/quota/quotaSourceTrust.test
 */

import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, renderHook, waitFor } from '@testing-library/react'
import ClaudeUsageColumn from '../../../../src/pages/usage/components/ClaudeUsageColumn'
import CodexUsageColumn from '../../../../src/pages/usage/components/CodexUsageColumn'
import DualUsageCard from '../../../../src/pages/usage/components/DualUsageCard'
import useClaudeUsageStatus from '../../../../src/pages/usage/useClaudeUsageStatus'

const NOW = new Date('2026-07-12T12:00:00+08:00')
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000)

function makeSnapshot(updatedAt = NOW_SECONDS) {
  return {
    hasRateLimits: true,
    updatedAt,
    fiveHourUsedPercentage: 12,
    resetsAt: NOW_SECONDS + 3600,
    sevenDayUsedPercentage: 34,
    sevenDayResetsAt: NOW_SECONDS + 86400,
  }
}

function makeClaudeState(updatedAt = NOW_SECONDS) {
  return {
    integrationState: 'ready',
    config: { displayMode: 'always' },
    snapshot: makeSnapshot(updatedAt),
  }
}

function makeCodexState(updatedAt = NOW_SECONDS) {
  return {
    integrationState: 'ready',
    snapshot: makeSnapshot(updatedAt),
  }
}

describe('V1.9.9 会员额度来源与 stale', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('Q-TC-01: Claude 栏展示 statusLine rate_limits 来源', () => {
    render(<ClaudeUsageColumn statusState={makeClaudeState()} loading={false} />)
    expect(screen.getByText('statusLine rate_limits 快照')).toBeInTheDocument()
    expect(screen.getByText('运行 Claude Code 对话时')).toBeInTheDocument()
  })

  it('Q-TC-02: Codex 栏展示本地 session 日志且 ready 为已读取', () => {
    render(<CodexUsageColumn statusState={makeCodexState()} loading={false} />)
    expect(screen.getByText('本地 session 日志')).toBeInTheDocument()
    expect(screen.getByText('运行 Codex 产生新日志时')).toBeInTheDocument()
    expect(screen.getByText('已读取')).toBeInTheDocument()
  })

  it('Q-TC-03: 页面和双栏不再宣称统一官方 rate_limits', () => {
    render(
      <DualUsageCard
        claude={{ statusState: makeClaudeState(), loading: false }}
        codex={{ statusState: makeCodexState(), loading: false }}
        onRefresh={vi.fn()}
      />
    )
    expect(screen.getByText(/本机读取 · 超过 2 小时/)).toBeInTheDocument()
    expect(screen.queryByText(/额度来自各工具官方 rate_limits/)).not.toBeInTheDocument()

    const pageSource = fs.readFileSync(path.join(process.cwd(), 'src/pages/ClaudeUsageStatusPage.jsx'), 'utf8')
    expect(pageSource).not.toContain('官方 rate_limits')
    expect(pageSource).toContain('Codex 本地会话日志')
  })

  it('Q-TC-04: 严格超过 2 小时时两栏进入 stale 且保留数值', () => {
    const staleAt = NOW_SECONDS - (2 * 60 * 60) - 1
    render(
      <>
        <ClaudeUsageColumn statusState={makeClaudeState(staleAt)} loading={false} />
        <CodexUsageColumn statusState={makeCodexState(staleAt)} loading={false} />
      </>
    )
    expect(screen.getAllByText('2 小时未更新')).toHaveLength(2)
    expect(screen.getAllByText('12%')).toHaveLength(2)
    expect(screen.getAllByText('34%')).toHaveLength(2)
  })

  it('Q-TC-05: 恰好 2 小时时保持正常态', () => {
    const boundaryAt = NOW_SECONDS - (2 * 60 * 60)
    render(
      <>
        <ClaudeUsageColumn statusState={makeClaudeState(boundaryAt)} loading={false} />
        <CodexUsageColumn statusState={makeCodexState(boundaryAt)} loading={false} />
      </>
    )
    expect(screen.queryByText('2 小时未更新')).not.toBeInTheDocument()
    expect(screen.getByText('已接入')).toBeInTheDocument()
    expect(screen.getByText('已读取')).toBeInTheDocument()
  })
})

describe('V1.9.9 Claude 接入所有权交互', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete window.electronAPI
  })

  it('Q-TC-06: not_configured 页面加载不自动调用安装 IPC', async () => {
    window.electronAPI = {
      getClaudeUsageStatusState: vi.fn().mockResolvedValue({
        success: true,
        integrationState: 'not_configured',
        scriptOutdated: false,
        config: {},
        snapshot: null,
      }),
      getClaudeUsageHistory: vi.fn().mockResolvedValue({ success: true, completedCycles: [] }),
      ensureClaudeUsageStatusInstalled: vi.fn(),
    }
    const { result } = renderHook(() => useClaudeUsageStatus())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(window.electronAPI.ensureClaudeUsageStatusInstalled).not.toHaveBeenCalled()
  })

  it('Q-TC-07: conflict 主按钮只打开确认弹窗', () => {
    const onEnsureInstalled = vi.fn().mockResolvedValue(true)
    render(
      <ClaudeUsageColumn
        statusState={{ integrationState: 'conflict', snapshot: null }}
        loading={false}
        installing={false}
        onEnsureInstalled={onEnsureInstalled}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: '查看接管说明' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('接管 Claude statusLine')).toBeInTheDocument()
    expect(onEnsureInstalled).not.toHaveBeenCalled()
  })

  it('Q-TC-08: 取消接管关闭弹窗且不调用安装', () => {
    const onEnsureInstalled = vi.fn().mockResolvedValue(true)
    render(
      <ClaudeUsageColumn
        statusState={{ integrationState: 'conflict', snapshot: null }}
        loading={false}
        installing={false}
        onEnsureInstalled={onEnsureInstalled}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: '查看接管说明' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onEnsureInstalled).not.toHaveBeenCalled()
  })

  it('Q-TC-08b: 确认接管才以 force=true 调用安装', async () => {
    const onEnsureInstalled = vi.fn().mockResolvedValue(true)
    render(
      <ClaudeUsageColumn
        statusState={{ integrationState: 'conflict', snapshot: null }}
        loading={false}
        installing={false}
        onEnsureInstalled={onEnsureInstalled}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: '查看接管说明' }))
    fireEvent.click(screen.getByRole('button', { name: '确认接管' }))
    await waitFor(() => expect(onEnsureInstalled).toHaveBeenCalledWith({ force: true }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('Q-TC-10: 仅托管脚本过期时静默升级', async () => {
    const ensure = vi.fn().mockResolvedValue({ success: true })
    window.electronAPI = {
      getClaudeUsageStatusState: vi.fn().mockResolvedValue({
        success: true,
        integrationState: 'ready',
        usesManagedStatusLine: true,
        scriptOutdated: true,
        config: {},
        snapshot: makeSnapshot(),
      }),
      getClaudeUsageHistory: vi.fn().mockResolvedValue({ success: true, completedCycles: [] }),
      ensureClaudeUsageStatusInstalled: ensure,
    }
    const { result } = renderHook(() => useClaudeUsageStatus())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await waitFor(() => expect(ensure).toHaveBeenCalledTimes(1))
    expect(ensure).toHaveBeenCalledWith({ force: true })
  })
})
