/**
 * V1.9.7 新建项目托管 Coding 框架 — 后端测试
 *
 * 负责：
 * - v3 模板：ISSUES.md / docs/README.md 两个开发范式配套 key 的注册、拷贝、落位
 * - AGENTS/CLAUDE 能力框架内容验收（路由表 / 硬挂与可选 skill / 降级条款 / 归档地图 / 协议版本）
 * - 记忆协议追加、向后兼容（旧 payload 不生成新文件）
 * - 模板通用化硬验收（不含 CodePal 设计系统专属词）
 *
 * @module 自动化测试/V1.9.7/tests/backend/projectInitV3.test
 */

import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

const require = createRequire(import.meta.url)
const { registerProjectInitHandlers } = require('../../../../electron/handlers/registerProjectInitHandlers')
const { DEFAULT_TEMPLATE_KEYS } = require('../../../../electron/config/projectInitConfig')

function createRegisteredHandlers() {
  const handlers = new Map()
  const templateBaseDir = path.resolve(process.cwd(), 'templates', 'project-init-v3')
  const ipcMain = { handle: (name, fn) => handlers.set(name, fn) }
  registerProjectInitHandlers({
    ipcMain,
    expandHome: (p) => (p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p),
    pathExists: async (p) => {
      try { await fs.access(p); return true } catch { return false }
    },
    templateBaseDir,
  })
  return { handlers, templateBaseDir }
}

const ALL_V3 = ['agents', 'claude', 'memory', 'specs', 'gitignore', 'issues', 'docsReadme']
const LEGACY_V2 = ['agents', 'claude', 'memory', 'specs', 'gitignore']

describe('V1.9.7 新建项目 v3 模板（托管 Coding 框架）', () => {
  let handlers
  let templateBaseDir
  let tempBasePath

  beforeEach(async () => {
    const r = createRegisteredHandlers()
    handlers = r.handlers
    templateBaseDir = r.templateBaseDir
    tempBasePath = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-v3-test-'))
  })

  afterEach(async () => {
    await fs.rm(tempBasePath, { recursive: true, force: true })
  })

  it('BE-1: DEFAULT_TEMPLATE_KEYS 含 issues 与 docsReadme（共 7 个）', () => {
    expect(DEFAULT_TEMPLATE_KEYS).toContain('issues')
    expect(DEFAULT_TEMPLATE_KEYS).toContain('docsReadme')
    expect(DEFAULT_TEMPLATE_KEYS.length).toBe(7)
  })

  it('BE-2: validate 的 templatePlans 含 issues(file→ISSUES.md) 与 docsReadme(file→docs/README.md)', async () => {
    const validate = handlers.get('project-init-validate')
    const result = await validate({}, {
      projectName: 'p', targetPath: tempBasePath, gitMode: 'none', templates: ALL_V3, overwrite: false,
    })
    expect(result.valid).toBe(true)
    const plans = result.data.templatePlans
    const issues = plans.find((p) => p.key === 'issues')
    expect(issues.type).toBe('file')
    expect(issues.targetPath.endsWith('ISSUES.md')).toBe(true)
    const dr = plans.find((p) => p.key === 'docsReadme')
    expect(dr.type).toBe('file')
    expect(dr.targetPath.endsWith(path.join('docs', 'README.md'))).toBe(true)
  })

  it('BE-3: execute 全选生成 ISSUES.md + docs/README.md + specs 树 + .gitignore', async () => {
    const execute = handlers.get('project-init-execute')
    const projectRoot = path.join(tempBasePath, 'p1')
    const result = await execute({}, {
      projectName: 'p1', targetPath: tempBasePath, gitMode: 'none', templates: ALL_V3, overwrite: false,
    })
    expect(result.success).toBe(true)
    await expect(fs.access(path.join(projectRoot, 'ISSUES.md'))).resolves.toBeUndefined()
    await expect(fs.access(path.join(projectRoot, 'docs', 'README.md'))).resolves.toBeUndefined()
    await expect(fs.access(path.join(projectRoot, '.gitignore'))).resolves.toBeUndefined()
    const unit = path.join(projectRoot, 'specs', '_example-示例功能')
    for (const f of ['1-plan.md', '2-design.md', '3-prd.md', '4-test-cases.md', 'README.md']) {
      await expect(fs.access(path.join(unit, f))).resolves.toBeUndefined()
    }
  })

  it('BE-4: 生成的 ISSUES.md 是可用的池子模板（标题 + 状态图例 + 用法）', async () => {
    const execute = handlers.get('project-init-execute')
    const projectRoot = path.join(tempBasePath, 'p2')
    await execute({}, { projectName: 'p2', targetPath: tempBasePath, gitMode: 'none', templates: ['issues'], overwrite: false })
    const pool = await fs.readFile(path.join(projectRoot, 'ISSUES.md'), 'utf-8')
    expect(pool).toContain('# Issue 池')
    expect(pool).toContain('💭')
    expect(pool).toContain('✅ 已发版')
    expect(pool).toContain('issue-pool')
  })

  it('BE-5: AGENTS/CLAUDE 含能力路由表：三硬挂 skill + 池子 + 归档地图 + 协议 v3', async () => {
    const execute = handlers.get('project-init-execute')
    const projectRoot = path.join(tempBasePath, 'p3')
    await execute({}, { projectName: 'p3', targetPath: tempBasePath, gitMode: 'none', templates: ['agents', 'claude'], overwrite: false })
    const md = await fs.readFile(path.join(projectRoot, 'CLAUDE.md'), 'utf-8')
    expect(md).toContain('协议 v3')
    expect(md).toContain('能力路由表')
    expect(md).toContain('issue-pool')
    expect(md).toContain('design-exploration')
    expect(md).toContain('prd-test-writer')
    expect(md).toContain('ISSUES.md')
    expect(md).toContain('归档地图')
    expect(md).toContain('唯一流通货币是 task')
  })

  it('BE-6: ⑤发布/⑥反馈不硬挂——git-push 与 issue-triage 以「可选」出现且有降级条款', async () => {
    const execute = handlers.get('project-init-execute')
    const projectRoot = path.join(tempBasePath, 'p4')
    await execute({}, { projectName: 'p4', targetPath: tempBasePath, gitMode: 'none', templates: ['claude'], overwrite: false })
    const md = await fs.readFile(path.join(projectRoot, 'CLAUDE.md'), 'utf-8')
    expect(md).toContain('可选 `git-push`')
    expect(md).toContain('可选 `issue-triage`')
    // 降级条款：skill 不在场时模型自主完成
    expect(md).toContain('自主完成')
    // 弹性条款：小修小补不走全链
    expect(md).toContain('①→④→⑤')
  })

  it('BE-7: AGENTS 首行 # AGENTS.md，与 CLAUDE 除首行一致，含同步提示', async () => {
    const execute = handlers.get('project-init-execute')
    const projectRoot = path.join(tempBasePath, 'p5')
    await execute({}, { projectName: 'p5', targetPath: tempBasePath, gitMode: 'none', templates: ['agents', 'claude'], overwrite: false })
    const a = (await fs.readFile(path.join(projectRoot, 'AGENTS.md'), 'utf-8')).split('\n')
    const c = (await fs.readFile(path.join(projectRoot, 'CLAUDE.md'), 'utf-8')).split('\n')
    expect(a[0]).toBe('# AGENTS.md')
    expect(a.slice(1).join('\n')).toBe(c.slice(1).join('\n'))
    expect(a.join('\n')).toContain('改一份请同步另一份')
  })

  it('BE-8: 勾记忆系统时记忆协议追加仍工作（含「最近 7 天」）', async () => {
    const execute = handlers.get('project-init-execute')
    const projectRoot = path.join(tempBasePath, 'p6')
    await execute({}, { projectName: 'p6', targetPath: tempBasePath, gitMode: 'none', templates: ['agents', 'memory'], overwrite: false })
    const agents = await fs.readFile(path.join(projectRoot, 'AGENTS.md'), 'utf-8')
    expect(agents).toContain('冷启动')
    expect(agents).toContain('最近 7 天')
  })

  it('BE-9: 向后兼容——V2 旧 payload（5 key）不生成 ISSUES.md 与 docs/README.md', async () => {
    const execute = handlers.get('project-init-execute')
    const projectRoot = path.join(tempBasePath, 'p7')
    const result = await execute({}, {
      projectName: 'p7', targetPath: tempBasePath, gitMode: 'none', templates: LEGACY_V2, overwrite: false,
    })
    expect(result.success).toBe(true)
    await expect(fs.access(path.join(projectRoot, 'ISSUES.md'))).rejects.toBeTruthy()
    await expect(fs.access(path.join(projectRoot, 'docs', 'README.md'))).rejects.toBeTruthy()
    // docs/ 目录本身是固定目录，仍应存在
    await expect(fs.access(path.join(projectRoot, 'docs'))).resolves.toBeUndefined()
  })

  it('GN-1: v3 模板通用化——不含 CodePal 设计系统专属词', async () => {
    const forbidden = /design-operating-system|cool steel|pageshell|派生快照|双层仓库/i
    const files = ['AGENTS.md', 'CLAUDE.md', 'ISSUES.md', 'docs-readme.md', 'specs/README.md', 'specs/_example-示例功能/1-plan.md']
    for (const f of files) {
      const content = await fs.readFile(path.join(templateBaseDir, f), 'utf-8')
      expect(forbidden.test(content), `${f} 含专属词`).toBe(false)
    }
  })
})
