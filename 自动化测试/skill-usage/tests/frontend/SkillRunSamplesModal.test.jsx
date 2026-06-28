/**
 * SkillRunSamplesModal — 运行样本抽屉前端测试
 *
 * 覆盖：成功态三层数字与样本、空态、失败态、长文本预览容器。
 *
 * @module 自动化测试/skill-usage/tests/frontend/SkillRunSamplesModal.test
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import SkillRunSamplesModal from '@/components/skillUsage/SkillRunSamplesModal'

function mockListSkillRunSamples(response) {
  const listSkillRunSamples = vi.fn().mockResolvedValue(response)
  Object.defineProperty(window, 'electronAPI', {
    value: { listSkillRunSamples },
    writable: true,
    configurable: true,
  })
  return listSkillRunSamples
}

describe('SkillRunSamplesModal', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    delete window.electronAPI
    document.body.style.overflow = ''
  })

  it('成功态展示 raw/logical/usable 三层数字和样本信息', async () => {
    const listSkillRunSamples = mockListSkillRunSamples({
      success: true,
      data: {
        totals: { rawEvents: 17, logicalRecords: 10, usableSamples: 6 },
        samples: [{
          sampleId: 'sample-1',
          timestamp: '2026-06-28T10:00:00.000Z',
          tool: 'codex',
          triggerType: 'goal_directive',
          userGoalPreview: '基于 goal-setter 设定一个可验收目标',
          sourceSession: 'session-abc',
          sourceLines: [12, 13],
          classificationReason: 'User explicitly invoked /goal with a skill mention.',
        }],
      },
    })

    render(
      <SkillRunSamplesModal
        open
        onClose={() => {}}
        skill={{ name: 'goal-setter', displayName: 'goal-setter' }}
      />
    )

    expect(screen.getByText('正在清洗运行日志...')).toBeTruthy()
    expect(await screen.findByText('17 raw')).toBeTruthy()
    expect(screen.getByText('10 logical')).toBeTruthy()
    expect(screen.getByText('6 usable')).toBeTruthy()
    expect(screen.getByText('基于 goal-setter 设定一个可验收目标')).toBeTruthy()
    expect(screen.getByText('session-abc')).toBeTruthy()
    expect(screen.getByText('lines 12, 13')).toBeTruthy()
    expect(listSkillRunSamples).toHaveBeenCalledWith({ skillName: 'goal-setter', windowDays: 30 })
  })

  it('空态说明 0 次不等于一定没用过', async () => {
    mockListSkillRunSamples({
      success: true,
      data: {
        totals: { rawEvents: 0, logicalRecords: 0, usableSamples: 0 },
        samples: [],
      },
    })

    render(<SkillRunSamplesModal open onClose={() => {}} skill={{ name: 'goal-setter' }} />)

    expect(await screen.findByText(/0 次不等于一定没用过/)).toBeTruthy()
  })

  it('读取失败时显示失败态', async () => {
    mockListSkillRunSamples({ success: false })

    render(<SkillRunSamplesModal open onClose={() => {}} skill={{ name: 'goal-setter' }} />)

    expect(await screen.findByText('运行样本读取失败')).toBeTruthy()
  })

  it('长文本仍渲染在预览容器中，由 CSS 做截断保护', async () => {
    const longPreview = 'x'.repeat(360)
    mockListSkillRunSamples({
      success: true,
      data: {
        totals: { rawEvents: 1, logicalRecords: 1, usableSamples: 1 },
        samples: [{
          sampleId: 'sample-long',
          timestamp: '2026-06-28T10:00:00.000Z',
          tool: 'codex',
          triggerType: 'codex_dollar',
          userGoalPreview: longPreview,
          sourceSession: 'session-long',
          sourceLines: [9],
          classificationReason: 'User text contains an explicit $skill mention.',
        }],
      },
    })

    const { container } = render(<SkillRunSamplesModal open onClose={() => {}} skill={{ name: 'goal-setter' }} />)

    await waitFor(() => {
      expect(container.querySelector('.skill-run-preview')?.textContent).toBe(longPreview)
    })
    expect(container.querySelector('.skill-run-preview')).toBeTruthy()
  })
})
