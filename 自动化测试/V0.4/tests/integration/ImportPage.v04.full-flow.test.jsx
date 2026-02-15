/**
 * V0.4 导入页全流程集成测试
 *
 * 负责：
 * - 覆盖导入页来源选择、按钮状态与导入执行链路
 * - 验证导入成功/失败、重新导入与仓库路径切换行为
 * - 锁定导入页关键文案与异常提示可见性
 *
 * @module 自动化测试/V0.4/tests/integration/ImportPage.v04.full-flow.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import ImportPage from '@/pages/ImportPage.jsx'
import { dataStore } from '@/store/data.js'

vi.mock('@/store/data.js', () => ({
  toolDefinitions: [
    {
      id: 'claude-code',
      name: 'Claude Code',
      icon: 'CC',
      iconClass: 'cc',
      path: '~/.claude/skills/',
    },
    {
      id: 'codex',
      name: 'CodeX',
      icon: 'CX',
      iconClass: 'cx',
      path: '~/.codex/skills/',
    },
  ],
  dataStore: {
    scanAllTools: vi.fn(),
    getConfig: vi.fn(),
    saveConfig: vi.fn(),
    importSkills: vi.fn(),
    reimportSkills: vi.fn(),
    selectAndSetRepoPath: vi.fn(),
  },
}))

/**
 * 刷新微任务队列
 * @returns {Promise<void>}
 */
async function flushMicrotasks() {
  await act(async () => {
    for (let index = 0; index < 8; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve()
    }
  })
}

describe('ImportPage V0.4 Full Flow (Integration)', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()

    dataStore.scanAllTools.mockResolvedValue([
      {
        id: 'claude-code',
        name: 'Claude Code',
        icon: 'CC',
        iconClass: 'cc',
        path: '~/.claude/skills/',
        skills: [{ name: 'commit-helper' }, { name: 'code-review' }],
        error: null,
      },
      {
        id: 'codex',
        name: 'CodeX',
        icon: 'CX',
        iconClass: 'cx',
        path: '~/.codex/skills/',
        skills: [],
        error: 'DIRECTORY_NOT_FOUND',
      },
    ])
    dataStore.getConfig.mockResolvedValue({
      repoPath: '/Users/demo/SkillManager',
      customPaths: [{ id: 'custom-1', path: '/workspace/team-skills', skills: { 'claude-code': 1, codex: 1 } }],
    })
    dataStore.saveConfig.mockResolvedValue({ success: true })
    dataStore.importSkills.mockResolvedValue({ success: true, copiedCount: 3, errors: null })
    dataStore.reimportSkills.mockResolvedValue({ success: true, copiedCount: 2, errors: null })
    dataStore.selectAndSetRepoPath.mockResolvedValue({
      success: true,
      canceled: false,
      path: '/Users/demo/new-repo',
      error: null,
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('IT-IMP-01: 初始化应加载工具与配置，并显示目录异常文案', async () => {
    render(<ImportPage onImportComplete={vi.fn()} />)
    await flushMicrotasks()

    expect(screen.getByText('Claude Code')).toBeTruthy()
    expect(screen.getAllByText('2 个 skill').length).toBeGreaterThan(0)
    expect(screen.getByText('CodeX')).toBeTruthy()
    expect(screen.getByText('目录不存在')).toBeTruthy()
    expect(screen.getByText(/SkillManager/)).toBeTruthy()
  })

  it('IT-IMP-02: 选择来源后应启用导入按钮并更新计数', async () => {
    render(<ImportPage onImportComplete={vi.fn()} />)
    await flushMicrotasks()

    const importButton = screen.getByRole('button', { name: '一键导入' })
    expect(importButton.disabled).toBe(true)

    fireEvent.click(screen.getByText('Claude Code'))
    await flushMicrotasks()

    expect(screen.getByText('已选 1 个来源')).toBeTruthy()
    expect(importButton.disabled).toBe(false)
  })

  it('IT-IMP-03: 导入成功应分离预设/自定义来源并回调 onImportComplete', async () => {
    vi.useFakeTimers()
    const onImportComplete = vi.fn()

    render(<ImportPage onImportComplete={onImportComplete} />)
    await flushMicrotasks()

    fireEvent.click(screen.getByText('Claude Code'))
    fireEvent.click(screen.getByText('team-skills'))
    await flushMicrotasks()

    fireEvent.click(screen.getByRole('button', { name: '一键导入' }))
    await flushMicrotasks()

    expect(dataStore.importSkills).toHaveBeenCalledWith(['claude-code'], ['custom-1'])
    expect(screen.getByText('已导入 3 个 skill')).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(onImportComplete).toHaveBeenCalledTimes(1)
  })

  it('IT-IMP-04: 导入失败应显示错误并留在当前页', async () => {
    const onImportComplete = vi.fn()
    dataStore.importSkills.mockResolvedValue({
      success: false,
      copiedCount: 0,
      errors: ['claude-code: PERMISSION_DENIED'],
    })

    render(<ImportPage onImportComplete={onImportComplete} />)
    await flushMicrotasks()

    fireEvent.click(screen.getByText('Claude Code'))
    fireEvent.click(screen.getByRole('button', { name: '一键导入' }))
    await flushMicrotasks()

    expect(screen.getByText(/导入失败：claude-code: PERMISSION_DENIED/)).toBeTruthy()
    expect(onImportComplete).toHaveBeenCalledTimes(0)
  })

  it('IT-IMP-05: 重新导入模式应调用 reimportSkills', async () => {
    render(<ImportPage onImportComplete={vi.fn()} isReimport />)
    await flushMicrotasks()

    fireEvent.click(screen.getByText('Claude Code'))
    fireEvent.click(screen.getByRole('button', { name: '重新导入' }))
    await flushMicrotasks()

    expect(dataStore.reimportSkills).toHaveBeenCalledWith(['claude-code'], [])
  })

  it('IT-IMP-06: 更改中央仓库位置成功后应更新显示路径', async () => {
    render(<ImportPage onImportComplete={vi.fn()} />)
    await flushMicrotasks()

    fireEvent.click(screen.getByRole('button', { name: '更改位置' }))
    await flushMicrotasks()

    expect(screen.getByText(/new-repo/)).toBeTruthy()
    expect(screen.getByText('中央仓库位置已更改')).toBeTruthy()
  })

  it('IT-IMP-07: 更改中央仓库位置失败应展示错误提示', async () => {
    dataStore.selectAndSetRepoPath.mockResolvedValue({
      success: false,
      canceled: false,
      path: null,
      error: 'PERMISSION_DENIED',
    })

    render(<ImportPage onImportComplete={vi.fn()} />)
    await flushMicrotasks()

    fireEvent.click(screen.getByRole('button', { name: '更改位置' }))
    await flushMicrotasks()

    expect(screen.getByText('更改位置失败')).toBeTruthy()
  })
})
