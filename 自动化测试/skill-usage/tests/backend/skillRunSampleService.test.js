/**
 * Skill Run Sample 清洗服务 — 后端测试
 *
 * 覆盖：Codex 双写去重、续跑/计划误报过滤、账本 upsert 幂等、损坏行跳过。
 *
 * @module 自动化测试/skill-usage/tests/backend/skillRunSampleService.test
 */

import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

const require = createRequire(import.meta.url)
const { scanLogFilesInRange } = require('../../../../electron/logScanner')
const {
  scanSkillRunSamples,
  loadSkillRunLedger,
  writeSkillRunLedger,
} = require('../../../../electron/services/skillRunSampleService')

const DAY = 86400000
const SKILLS = ['goal-setter', 'git-push']
const pathExists = async (p) => { try { await fs.access(p); return true } catch { return false } }

async function writeJsonl(file, records) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, records.map((record) => JSON.stringify(record)).join('\n') + '\n')
}

describe('skillRunSampleService', () => {
  let home
  let now
  let nowFn
  let ts

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-run-samples-'))
    now = new Date('2026-06-28T14:17:34.000Z')
    nowFn = () => now
    ts = new Date(now.getTime() - DAY).toISOString()
  })

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true })
  })

  it('Codex 同一用户消息双写去重：2 raw → 1 logical → 1 usable', async () => {
    const file = path.join(home, '.codex', 'sessions', '2026', '06', '27', 'r.jsonl')
    const text = '用 $goal-setter 帮我整理成可执行 goal，还是 $goal-setter 这个 skill'
    await writeJsonl(file, [
      { type: 'response_item', timestamp: ts, payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } },
      { type: 'event_msg', timestamp: new Date(Date.parse(ts) + 1).toISOString(), payload: { type: 'user_message', message: text } },
    ])

    const result = await scanSkillRunSamples(
      { homeDir: home, scanLogFilesInRangeFn: scanLogFilesInRange, pathExistsFn: pathExists, nowFn },
      { windowDays: 30, skillNames: SKILLS }
    )

    expect(result.rawEventCount).toBe(2)
    expect(result.logicalRecordCount).toBe(1)
    expect(result.usableRunSampleCount).toBe(1)
    expect(result.skills[0]).toMatchObject({
      name: 'goal-setter',
      total: 1,
      usableSamples: 1,
      rawEvents: 2,
      logicalRecords: 1,
      codex: 1,
    })

    const ledgerOnce = await loadSkillRunLedger({ homeDir: home })
    expect(ledgerOnce.length).toBe(1)

    await scanSkillRunSamples(
      { homeDir: home, scanLogFilesInRangeFn: scanLogFilesInRange, pathExistsFn: pathExists, nowFn },
      { windowDays: 30, skillNames: SKILLS }
    )
    const ledgerTwice = await loadSkillRunLedger({ homeDir: home })
    expect(ledgerTwice.length).toBe(1)
  })

  it('Codex goal 续跑和计划正文示例不生成 usable sample', async () => {
    const file = path.join(home, '.codex', 'sessions', '2026', '06', '28', 'r.jsonl')
    await writeJsonl(file, [
      {
        type: 'response_item',
        timestamp: ts,
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: '<codex_internal_context source="goal"><objective>[$goal-setter](path) 做个目标</objective></codex_internal_context>' }],
        },
      },
      {
        type: 'event_msg',
        timestamp: new Date(Date.parse(ts) + 1000).toISOString(),
        payload: {
          type: 'user_message',
          message: 'PLEASE IMPLEMENT THIS PLAN: create skill goal-setter with default_prompt="Use $goal-setter to create a goal."',
        },
      },
    ])

    const result = await scanSkillRunSamples(
      { homeDir: home, scanLogFilesInRangeFn: scanLogFilesInRange, pathExistsFn: pathExists, nowFn },
      { windowDays: 30, skillNames: SKILLS }
    )

    expect(result.rawEventCount).toBe(2)
    expect(result.logicalRecordCount).toBe(2)
    expect(result.usableRunSampleCount).toBe(0)
    expect(result.skills[0]).toMatchObject({
      name: 'goal-setter',
      total: 0,
      rawEvents: 2,
      logicalRecords: 2,
    })
    expect(result.logicalRecords.map((record) => record.sampleQuality).sort()).toEqual(['invalid', 'partial'])
  })

  it('/goal + $skill 算有效样本，triggerType=goal_directive', async () => {
    const file = path.join(home, '.codex', 'sessions', '2026', '06', '28', 'goal.jsonl')
    await writeJsonl(file, [
      { type: 'event_msg', timestamp: ts, payload: { type: 'user_message', message: '/goal [$goal-setter](path) 调研语音接入' } },
    ])

    const result = await scanSkillRunSamples(
      { homeDir: home, scanLogFilesInRangeFn: scanLogFilesInRange, pathExistsFn: pathExists, nowFn },
      { windowDays: 30, skillNames: SKILLS }
    )

    expect(result.usableSamples[0]).toMatchObject({
      triggerType: 'goal_directive',
      sampleQuality: 'usable',
      skillRequested: 'goal-setter',
      skillExecuted: 'goal-setter',
    })
  })

  it('Claude tool_use、Claude slash、Codex $skill 三类正常生成 usable sample', async () => {
    const claudeFile = path.join(home, '.claude', 'projects', 'proj', 'claude.jsonl')
    const codexFile = path.join(home, '.codex', 'sessions', '2026', '06', '28', 'codex.jsonl')
    await writeJsonl(claudeFile, [
      { type: 'assistant', timestamp: ts, message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'git-push' } }] } },
      { type: 'user', timestamp: new Date(Date.parse(ts) + 1000).toISOString(), message: { content: '<command-name>/goal-setter</command-name> 帮我收敛目标' } },
    ])
    await writeJsonl(codexFile, [
      { type: 'event_msg', timestamp: new Date(Date.parse(ts) + 2000).toISOString(), payload: { type: 'user_message', message: '请用 $git-push 发版' } },
    ])

    const result = await scanSkillRunSamples(
      { homeDir: home, scanLogFilesInRangeFn: scanLogFilesInRange, pathExistsFn: pathExists, nowFn },
      { windowDays: 30, skillNames: SKILLS }
    )

    const byName = Object.fromEntries(result.skills.map((skill) => [skill.name, skill]))
    expect(result.usableRunSampleCount).toBe(3)
    expect(byName['git-push']).toMatchObject({ claude: 1, codex: 1, total: 2, usableSamples: 2 })
    expect(byName['goal-setter']).toMatchObject({ claude: 1, codex: 0, total: 1, usableSamples: 1 })
    expect(result.usableSamples.map((sample) => sample.triggerType).sort()).toEqual([
      'claude_slash',
      'claude_tool_use',
      'codex_dollar',
    ])
  })

  it('账本读取跳过损坏行并保留可读记录', async () => {
    const ledgerPath = path.join(home, 'Documents', 'SkillManager', '.codepal', 'skill-runs.jsonl')
    await writeSkillRunLedger({
      homeDir: home,
      ledgerPath,
      records: [{
        sampleId: 'skill-run-good',
        skillRequested: 'goal-setter',
        timestamp: ts,
      }],
    })
    await fs.appendFile(ledgerPath, '{bad json\n')

    const records = await loadSkillRunLedger({ homeDir: home, ledgerPath })
    expect(records).toHaveLength(1)
    expect(records[0].sampleId).toBe('skill-run-good')
  })
})
