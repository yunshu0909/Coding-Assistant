/**
 * V1.9.7 前端常量 — 单元测试
 *
 * 负责：
 * - TEMPLATE_OPTIONS 含「开发范式配套」勾选项（key=issues，extraKeys 联动 docsReadme）
 * - DEFAULT_TEMPLATE_SELECTION 默认勾选 issues
 * - TREE_NODES 含 ISSUES.md 与 docs/README.md 预览节点，且随 issues 勾选联动
 *
 * @module 自动化测试/V1.9.7/tests/unit/projectInitConstants.test
 */

import { describe, it, expect } from 'vitest'
import {
  TEMPLATE_OPTIONS,
  DEFAULT_TEMPLATE_SELECTION,
  TREE_NODES,
} from '../../../../src/pages/projectInit/projectInitConstants'

describe('V1.9.7 前端常量（开发范式配套）', () => {
  it('FE-1: TEMPLATE_OPTIONS 有 issues 选项且 extraKeys 联动 docsReadme', () => {
    const opt = TEMPLATE_OPTIONS.find((o) => o.key === 'issues')
    expect(opt).toBeTruthy()
    expect(opt.extraKeys).toEqual(['docsReadme'])
  })

  it('FE-2: 选项派生 payload 时展开 extraKeys（模拟 ProjectInitPage 派生逻辑）', () => {
    const selection = { ...DEFAULT_TEMPLATE_SELECTION }
    const selected = TEMPLATE_OPTIONS
      .filter((item) => selection[item.key])
      .flatMap((item) => [item.key, ...(item.extraKeys || [])])
    expect(selected).toContain('issues')
    expect(selected).toContain('docsReadme')
    expect(selected.length).toBe(7)
  })

  it('FE-3: DEFAULT_TEMPLATE_SELECTION 默认勾选 issues', () => {
    expect(DEFAULT_TEMPLATE_SELECTION.issues).toBe(true)
  })

  it('FE-4: TREE_NODES 含 ISSUES.md 与 docs/README.md 节点，随 issues 勾选显隐', () => {
    const issuesNode = TREE_NODES.find((n) => n.key === 'issues')
    const readmeNode = TREE_NODES.find((n) => n.key === 'docs-readme')
    expect(issuesNode).toBeTruthy()
    expect(readmeNode).toBeTruthy()
    const shown = { templateSelection: { issues: true }, gitMode: 'none' }
    const hidden = { templateSelection: { issues: false }, gitMode: 'none' }
    expect(issuesNode.visibleWhen(shown)).toBe(true)
    expect(issuesNode.visibleWhen(hidden)).toBe(false)
    expect(readmeNode.visibleWhen(shown)).toBe(true)
    expect(readmeNode.visibleWhen(hidden)).toBe(false)
  })
})
