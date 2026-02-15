/**
 * V0.4 配置页全流程集成测试
 *
 * 负责：
 * - 覆盖配置加载、保存、返回、删除路径与最少推送目标约束
 * - 覆盖新增路径后增量导入（仅新增不覆盖）的触发链路
 * - 验证保存失败/增量导入失败时页面留存与错误提示
 *
 * @module 自动化测试/V0.4/tests/integration/ConfigPage.v04.full-flow.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import ConfigPage from '@/pages/ConfigPage.jsx'
import { dataStore } from '@/store/data.js'

vi.mock('@/store/data.js', () => ({
  toolDefinitions: [
    { id: 'claude-code', name: 'Claude Code', icon: 'CC', path: '~/.claude/skills/' },
    { id: 'codex', name: 'CodeX', icon: 'CX', path: '~/.codex/skills/' },
    { id: 'cursor', name: 'Cursor', icon: 'CU', path: '~/.cursor/skills/' },
  ],
  dataStore: {
    getImportSources: vi.fn(),
    getPushTargets: vi.fn(),
    getCustomPaths: vi.fn(),
    saveImportSources: vi.fn(),
    savePushTargets: vi.fn(),
    deleteCustomPath: vi.fn(),
    addCustomPath: vi.fn(),
    incrementalImport: vi.fn(),
  },
}))

vi.mock('@/components/AddPathModal.jsx', () => ({
  default: ({ isOpen, onClose, onConfirm }) => {
    if (!isOpen) return null
    return (
      <div data-testid="mock-add-path-modal">
        <button onClick={() => onConfirm({ path: '/workspace/new-source', skills: { 'claude-code': 2 } })}>
          模拟确认添加
        </button>
        <button onClick={onClose}>关闭弹窗</button>
      </div>
    )
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

describe('ConfigPage V0.4 Full Flow (Integration)', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()

    dataStore.getImportSources.mockResolvedValue(['claude-code'])
    dataStore.getPushTargets.mockResolvedValue(['claude-code', 'codex'])
    dataStore.getCustomPaths.mockResolvedValue([
      { id: 'custom-1', path: '/workspace/team', skills: { codex: 2 } },
    ])
    dataStore.saveImportSources.mockResolvedValue({ success: true, error: null })
    dataStore.savePushTargets.mockResolvedValue({ success: true, error: null })
    dataStore.deleteCustomPath.mockResolvedValue({ success: true, error: null })
    dataStore.addCustomPath.mockResolvedValue({
      success: true,
      customPath: { id: 'custom-2', path: '/workspace/new-source', skills: { 'claude-code': 2 } },
      error: null,
    })
    dataStore.incrementalImport.mockResolvedValue({
      success: true,
      added: 2,
      skipped: 0,
      errors: null,
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('IT-CONFIG-01: 初始化应加载来源、推送目标与自定义路径', async () => {
    render(<ConfigPage onBack={vi.fn()} />)
    await flushMicrotasks()

    expect(screen.getByText('导入来源（扫描这些路径的技能）')).toBeTruthy()
    expect(screen.getByText('推送目标（勾选要推送的工具）')).toBeTruthy()
    expect(screen.getByText('team')).toBeTruthy()
    expect(screen.getByText(/共 2 个 skill/)).toBeTruthy()
  })

  it('IT-CONFIG-02: 点击返回应触发 onBack 且不触发保存', async () => {
    const onBack = vi.fn()
    render(<ConfigPage onBack={onBack} />)
    await flushMicrotasks()

    fireEvent.click(screen.getByRole('button', { name: /返回/ }))

    expect(onBack).toHaveBeenCalledTimes(1)
    expect(dataStore.saveImportSources).toHaveBeenCalledTimes(0)
    expect(dataStore.savePushTargets).toHaveBeenCalledTimes(0)
  })

  it('IT-CONFIG-03: 删除自定义路径应调用 deleteCustomPath 并更新视图', async () => {
    render(<ConfigPage onBack={vi.fn()} />)
    await flushMicrotasks()

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await flushMicrotasks()

    expect(dataStore.deleteCustomPath).toHaveBeenCalledWith('custom-1')
    expect(screen.queryByText('team')).toBeNull()
  })

  it('IT-CONFIG-04: 保存成功后应持久化配置并返回管理页', async () => {
    vi.useFakeTimers()
    const onBack = vi.fn()
    render(<ConfigPage onBack={onBack} />)
    await flushMicrotasks()

    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
    await flushMicrotasks()

    expect(dataStore.saveImportSources).toHaveBeenCalledWith(['claude-code'])
    expect(dataStore.savePushTargets).toHaveBeenCalledWith(['claude-code', 'codex'])
    expect(screen.getByText('配置已保存')).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900)
    })
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('IT-CONFIG-05: 推送目标为空时应阻止保存并提示错误', async () => {
    dataStore.getPushTargets.mockResolvedValue([])

    render(<ConfigPage onBack={vi.fn()} />)
    await flushMicrotasks()

    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
    await flushMicrotasks()

    expect(screen.getByText('至少保留一个推送目标')).toBeTruthy()
    expect(dataStore.saveImportSources).toHaveBeenCalledTimes(0)
    expect(dataStore.savePushTargets).toHaveBeenCalledTimes(0)
  })

  it('IT-CONFIG-06: 新增自定义路径后保存应触发 incrementalImport', async () => {
    render(<ConfigPage onBack={vi.fn()} />)
    await flushMicrotasks()

    fireEvent.click(screen.getByRole('button', { name: '+ 添加自定义路径' }))
    await flushMicrotasks()
    fireEvent.click(screen.getByRole('button', { name: '模拟确认添加' }))
    await flushMicrotasks()

    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
    await flushMicrotasks()

    expect(dataStore.addCustomPath).toHaveBeenCalledWith('/workspace/new-source')
    expect(dataStore.incrementalImport).toHaveBeenCalledWith(['custom-2'])
  })

  it('IT-CONFIG-07: incrementalImport 失败时应显示错误并停留页面', async () => {
    const onBack = vi.fn()
    dataStore.incrementalImport.mockResolvedValue({
      success: false,
      added: 0,
      skipped: 0,
      errors: ['custom-2: EACCES'],
    })

    render(<ConfigPage onBack={onBack} />)
    await flushMicrotasks()

    fireEvent.click(screen.getByRole('button', { name: '+ 添加自定义路径' }))
    await flushMicrotasks()
    fireEvent.click(screen.getByRole('button', { name: '模拟确认添加' }))
    await flushMicrotasks()

    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
    await flushMicrotasks()

    expect(screen.getByText(/增量导入失败：custom-2: EACCES/)).toBeTruthy()
    expect(onBack).toHaveBeenCalledTimes(0)
  })

  it('IT-CONFIG-08: 加载重复 customPaths 时页面应只展示一条', async () => {
    dataStore.getCustomPaths.mockResolvedValue([
      { id: 'custom-1', path: '/workspace/team', skills: { codex: 2 } },
      { id: 'custom-dup', path: '/workspace/team/', skills: { codex: 2 } },
    ])

    render(<ConfigPage onBack={vi.fn()} />)
    await flushMicrotasks()

    expect(screen.getAllByText('team')).toHaveLength(1)
  })
})
