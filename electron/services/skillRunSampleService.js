/**
 * Skill 运行样本扫描与归一化服务
 *
 * 负责：
 * - 从 Claude/Codex 原始日志提取 skill 调用候选 raw event
 * - 归并同一用户输入的重复落盘记录，生成 logical record
 * - 过滤续跑回放和正文示例误报，得到可用于 Skill 进化的 usable sample
 * - 将归一化记录写入中央仓库隐藏账本，避免后续反复重挖脏日志
 *
 * @module electron/services/skillRunSampleService
 */

const crypto = require('crypto')
const fs = require('fs/promises')
const path = require('path')

const DAY_MS = 24 * 60 * 60 * 1000
const CMD_RE = /<command-name>\/?([a-zA-Z0-9_-]+)<\/command-name>/
const DOLLAR_RE = /\$([a-zA-Z][a-zA-Z0-9_-]+)/g
const PREVIEW_LIMIT = 280

function createEmptySourceStatus() {
  return { claude: 'missing', codex: 'missing' }
}

function hashText(text) {
  return crypto.createHash('sha1').update(text || '').digest('hex').slice(0, 12)
}

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function redactSensitiveText(text) {
  return cleanText(text)
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
    .replace(/(Bearer\s+)[^\s]+/gi, '$1token_redacted')
    .replace(/\b(refresh_token|access_token|authorization|cookie|session_token|api[_-]?key|token)\b\s*[:=]\s*["']?[^"'\s,;]+/gi, '$1=token_redacted')
}

function previewText(text) {
  const cleaned = redactSensitiveText(text)
  const objective = cleaned.match(/<objective>\s*(.*?)\s*<\/objective>/)
  const source = objective ? cleanText(objective[1]) : cleaned
  return source.slice(0, PREVIEW_LIMIT)
}

function defaultLedgerPath(homeDir) {
  return path.join(homeDir, 'Documents', 'SkillManager', '.codepal', 'skill-runs.jsonl')
}

async function pathExists(pathExistsFn, targetPath) {
  if (typeof pathExistsFn === 'function') return pathExistsFn(targetPath)
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function scanRootDetailed(basePath, startTime, endTime, scanFn, pathExistsFn, onLine) {
  if (!(await pathExists(pathExistsFn, basePath))) return 'missing'
  try {
    const { files } = await scanFn(basePath, startTime, endTime, {
      maxLinesPerFile: Infinity,
      maxFiles: 20000,
    })
    for (const file of files) {
      file.lines.forEach((line, index) => onLine(line, file.path, index + 1))
    }
    return 'ok'
  } catch {
    return 'error'
  }
}

function extractClaudeUserText(record) {
  const content = record.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((item) => (typeof item === 'string' ? item : item?.text || '')).join(' ')
  }
  return ''
}

function extractCodexUserText(record) {
  if (record.type === 'event_msg' && record.payload?.type === 'user_message') {
    return typeof record.payload.message === 'string' ? record.payload.message : null
  }

  if (record.type === 'response_item' && record.payload?.type === 'message' && record.payload?.role === 'user') {
    const content = record.payload.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content.map((item) => (typeof item === 'string' ? item : item?.text || '')).join(' ')
    }
  }

  return null
}

function extractDollarSkills(text, nameSet) {
  const names = new Set()
  DOLLAR_RE.lastIndex = 0
  let match
  while ((match = DOLLAR_RE.exec(text || ''))) {
    if (nameSet.has(match[1])) names.add(match[1])
  }
  return Array.from(names)
}

function classifyCodexText(text, skillName) {
  const cleaned = cleanText(text)
  if (cleaned.startsWith('<codex_internal_context source="goal">')) {
    return {
      sampleQuality: 'partial',
      triggerType: 'codex_goal_continuation',
      confidence: 0.2,
      isUsable: false,
      skillExecuted: null,
      reason: 'Codex active goal continuation replayed the original objective.',
    }
  }

  if (
    cleaned.startsWith('PLEASE IMPLEMENT THIS PLAN:')
    && cleaned.includes('default_prompt')
    && cleaned.includes(`$${skillName}`)
  ) {
    return {
      sampleQuality: 'invalid',
      triggerType: 'embedded_plan',
      confidence: 0,
      isUsable: false,
      skillExecuted: null,
      reason: 'Prompt text contains a skill example while implementing a plan, not a skill call.',
    }
  }

  if (cleaned.startsWith('/goal ')) {
    return {
      sampleQuality: 'usable',
      triggerType: 'goal_directive',
      confidence: 0.95,
      isUsable: true,
      skillExecuted: skillName,
      reason: 'User explicitly invoked /goal with a skill mention.',
    }
  }

  return {
    sampleQuality: 'usable',
    triggerType: 'codex_dollar',
    confidence: 0.9,
    isUsable: true,
    skillExecuted: skillName,
    reason: 'User text contains an explicit $skill mention.',
  }
}

function classifyClaudeEvent(event) {
  if (event.triggerType === 'claude_tool_use') {
    return {
      sampleQuality: 'usable',
      triggerType: 'claude_tool_use',
      confidence: 0.95,
      isUsable: true,
      skillExecuted: event.skillName,
      reason: 'Claude assistant emitted Skill tool_use.',
    }
  }

  return {
    sampleQuality: 'usable',
    triggerType: 'claude_slash',
    confidence: 0.9,
    isUsable: true,
    skillExecuted: event.skillName,
    reason: 'Claude user message contains a skill slash command.',
  }
}

function sameLogicalEvent(previous, current) {
  if (!previous || !current) return false
  if (previous.tool !== current.tool) return false
  if (previous.sourceFile !== current.sourceFile) return false
  if (previous.skillName !== current.skillName) return false
  if (previous.textHash !== current.textHash) return false
  const closeTime = Math.abs(previous.timestampMs - current.timestampMs) <= 2000
  const adjacentLine = Math.abs(previous.sourceLine - current.sourceLine) <= 2
  return closeTime || adjacentLine
}

function buildSampleId(event, sourceLines) {
  const stableInput = [
    event.tool,
    path.basename(event.sourceFile),
    sourceLines[0],
    event.skillName,
    event.textHash,
  ].join('|')
  return `skill-run-${crypto.createHash('sha1').update(stableInput).digest('hex').slice(0, 16)}`
}

function rawEventToLogicalRecord(event, groupEvents) {
  const sourceLines = groupEvents.map((item) => item.sourceLine)
  const rawTypes = Array.from(new Set(groupEvents.map((item) => item.rawType)))
  const classification = event.tool === 'codex'
    ? classifyCodexText(event.text, event.skillName)
    : classifyClaudeEvent(event)

  return {
    sampleId: buildSampleId(event, sourceLines),
    skillRequested: event.skillName,
    skillExecuted: classification.skillExecuted,
    tool: event.tool,
    triggerType: classification.triggerType,
    sampleQuality: classification.sampleQuality,
    confidence: classification.confidence,
    timestamp: event.timestamp,
    sourceSession: path.basename(event.sourceFile).replace(/\.jsonl$/, ''),
    sourceLines,
    userGoalPreview: previewText(event.text || event.fallbackText),
    rawEventCount: groupEvents.length,
    continuationCount: classification.triggerType === 'codex_goal_continuation' ? 1 : 0,
    classificationReason: classification.reason,
    isUsable: classification.isUsable,
    rawTypes,
  }
}

function normalizeRawEvents(rawEvents) {
  const sorted = [...rawEvents].sort((a, b) => (
    a.timestampMs - b.timestampMs
    || a.sourceFile.localeCompare(b.sourceFile)
    || a.sourceLine - b.sourceLine
  ))

  const groups = []
  for (const event of sorted) {
    const lastGroup = groups[groups.length - 1]
    const lastEvent = lastGroup?.events[lastGroup.events.length - 1]
    if (lastGroup && sameLogicalEvent(lastEvent, event)) {
      lastGroup.events.push(event)
      continue
    }
    groups.push({ events: [event] })
  }

  return groups.map((group) => rawEventToLogicalRecord(group.events[0], group.events))
}

async function loadSkillRunLedger(params = {}) {
  const { homeDir, ledgerPath = defaultLedgerPath(homeDir), skillName, windowDays, nowFn = () => new Date() } = params
  let content = ''
  try {
    content = await fs.readFile(ledgerPath, 'utf-8')
  } catch {
    return []
  }

  const startMs = typeof windowDays === 'number' && windowDays > 0
    ? nowFn().getTime() - windowDays * DAY_MS
    : null

  return content
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      try { return JSON.parse(line) } catch { return null }
    })
    .filter(Boolean)
    .filter((record) => !skillName || record.skillRequested === skillName)
    .filter((record) => startMs === null || Date.parse(record.timestamp) >= startMs)
}

async function writeSkillRunLedger(params = {}) {
  const { homeDir, records = [], ledgerPath = defaultLedgerPath(homeDir) } = params
  const existing = await loadSkillRunLedger({ homeDir, ledgerPath })
  const byId = new Map(existing.map((record) => [record.sampleId, record]))
  for (const record of records) {
    byId.set(record.sampleId, record)
  }

  const nextRecords = Array.from(byId.values())
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.sampleId.localeCompare(b.sampleId))

  await fs.mkdir(path.dirname(ledgerPath), { recursive: true })
  await fs.writeFile(
    ledgerPath,
    nextRecords.map((record) => JSON.stringify(record)).join('\n') + (nextRecords.length ? '\n' : ''),
    'utf-8'
  )
  return { path: ledgerPath, count: nextRecords.length }
}

function summarizeBySkill(records, nameSet) {
  const byName = new Map()
  const ensure = (name) => {
    let entry = byName.get(name)
    if (!entry) {
      entry = {
        name,
        total: 0,
        usableSamples: 0,
        rawEvents: 0,
        logicalRecords: 0,
        claude: 0,
        codex: 0,
        lastUsedAt: null,
      }
      byName.set(name, entry)
    }
    return entry
  }

  for (const name of nameSet) ensure(name)

  for (const record of records) {
    const entry = ensure(record.skillRequested)
    entry.rawEvents += record.rawEventCount || 0
    entry.logicalRecords += 1
    if (record.isUsable) {
      entry.usableSamples += 1
      entry.total += 1
      entry[record.tool] += 1
      if (!entry.lastUsedAt || Date.parse(record.timestamp) > Date.parse(entry.lastUsedAt)) {
        entry.lastUsedAt = record.timestamp
      }
    }
  }

  return Array.from(byName.values())
    .filter((entry) => entry.total > 0 || entry.rawEvents > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}

async function scanSkillRunSamples(deps, params = {}) {
  const { homeDir, scanLogFilesInRangeFn, pathExistsFn, nowFn = () => new Date() } = deps
  const windowDays = typeof params.windowDays === 'number' && params.windowDays > 0 ? params.windowDays : 30
  const nameSet = new Set(Array.isArray(params.skillNames) ? params.skillNames : [])
  const now = nowFn()
  const startTime = new Date(now.getTime() - windowDays * DAY_MS)
  const startMs = startTime.getTime()
  const endMs = now.getTime()
  const rawEvents = []
  const sources = createEmptySourceStatus()

  if (nameSet.size > 0) {
    sources.claude = await scanRootDetailed(
      path.join(homeDir, '.claude', 'projects'),
      startTime,
      now,
      scanLogFilesInRangeFn,
      pathExistsFn,
      (line, sourceFile, sourceLine) => {
        let record
        try { record = JSON.parse(line) } catch { return }
        const timestampMs = record.timestamp ? Date.parse(record.timestamp) : NaN
        if (!(timestampMs >= startMs && timestampMs <= endMs)) return

        if (record.type === 'assistant' && record.message && Array.isArray(record.message.content)) {
          for (const item of record.message.content) {
            if (item?.type === 'tool_use' && item.name === 'Skill' && typeof item.input?.skill === 'string' && nameSet.has(item.input.skill)) {
              rawEvents.push({
                tool: 'claude',
                skillName: item.input.skill,
                timestamp: record.timestamp,
                timestampMs,
                sourceFile,
                sourceLine,
                text: '',
                fallbackText: `Claude Skill tool_use: ${item.input.skill}`,
                textHash: hashText(`claude_tool_use:${item.input.skill}:${record.timestamp}:${sourceLine}`),
                triggerType: 'claude_tool_use',
                rawType: 'assistant/tool_use',
              })
            }
          }
        }

        if (record.type === 'user') {
          const text = extractClaudeUserText(record)
          const match = text.match(CMD_RE)
          if (match && nameSet.has(match[1])) {
            rawEvents.push({
              tool: 'claude',
              skillName: match[1],
              timestamp: record.timestamp,
              timestampMs,
              sourceFile,
              sourceLine,
              text,
              textHash: hashText(text),
              triggerType: 'claude_slash',
              rawType: 'user/slash',
            })
          }
        }
      }
    )

    sources.codex = await scanRootDetailed(
      path.join(homeDir, '.codex', 'sessions'),
      startTime,
      now,
      scanLogFilesInRangeFn,
      pathExistsFn,
      (line, sourceFile, sourceLine) => {
        let record
        try { record = JSON.parse(line) } catch { return }
        const timestampMs = record.timestamp ? Date.parse(record.timestamp) : NaN
        if (!(timestampMs >= startMs && timestampMs <= endMs)) return

        const text = extractCodexUserText(record)
        const skillNames = extractDollarSkills(text, nameSet)
        for (const skillName of skillNames) {
          rawEvents.push({
            tool: 'codex',
            skillName,
            timestamp: record.timestamp,
            timestampMs,
            sourceFile,
            sourceLine,
            text,
            textHash: hashText(text),
            triggerType: 'codex_dollar',
            rawType: `${record.type}/${record.payload?.type || 'message'}`,
          })
        }
      }
    )
  }

  const logicalRecords = normalizeRawEvents(rawEvents)
  if (params.writeLedger !== false && logicalRecords.length > 0) {
    await writeSkillRunLedger({
      homeDir,
      ledgerPath: params.ledgerPath,
      records: logicalRecords,
    })
  }

  const usableSamples = logicalRecords.filter((record) => record.isUsable)
  const skills = summarizeBySkill(logicalRecords, nameSet)
  const totals = skills.reduce((acc, skill) => ({
    total: acc.total + skill.total,
    usableSamples: acc.usableSamples + skill.usableSamples,
    rawEvents: acc.rawEvents + skill.rawEvents,
    logicalRecords: acc.logicalRecords + skill.logicalRecords,
    claude: acc.claude + skill.claude,
    codex: acc.codex + skill.codex,
  }), { total: 0, usableSamples: 0, rawEvents: 0, logicalRecords: 0, claude: 0, codex: 0 })

  return {
    window: windowDays,
    startTime: startTime.toISOString(),
    endTime: now.toISOString(),
    skills,
    totals,
    sources,
    rawEventCount: rawEvents.length,
    logicalRecordCount: logicalRecords.length,
    usableRunSampleCount: usableSamples.length,
    logicalRecords,
    usableSamples,
    ledgerPath: params.ledgerPath || defaultLedgerPath(homeDir),
  }
}

module.exports = {
  scanSkillRunSamples,
  loadSkillRunLedger,
  writeSkillRunLedger,
  defaultLedgerPath,
  normalizeRawEvents,
}
