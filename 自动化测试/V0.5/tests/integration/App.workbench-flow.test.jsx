import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App.jsx'
import { dataStore } from '@/store/data.js'

vi.mock('@/store/data.js', () => ({
  dataStore: {
    hasCentralSkills: vi.fn(),
    isFirstEntryAfterImport: vi.fn(),
    getLastImportedToolIds: vi.fn(),
    initPushTargetsAfterImport: vi.fn(),
    setFirstEntryAfterImport: vi.fn(),
  },
}))

vi.mock('@/components/SkillManagerModule.jsx', () => ({
  default: () => <div data-testid="skills-module">技能管理模块</div>,
}))

vi.mock('@/pages/ImportPage.jsx', () => ({
  default: ({ onImportComplete }) => (
    <div>
      <div data-testid="import-page">导入页</div>
      <button onClick={onImportComplete}>完成导入</button>
    </div>
  ),
}))

async function waitUntil(assertion, timeoutMs = 1000) {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    try {
      assertion()
      return
    } catch (_) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }

  assertion()
}

describe('App Workbench Flow (V0.5)', () => {
  let container
  let root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    vi.clearAllMocks()
    dataStore.hasCentralSkills.mockResolvedValue(true)
    dataStore.isFirstEntryAfterImport.mockResolvedValue(false)
    dataStore.getLastImportedToolIds.mockReturnValue(['claude-code'])
    dataStore.initPushTargetsAfterImport.mockResolvedValue({ success: true })
    dataStore.setFirstEntryAfterImport.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('有中央仓库数据时默认进入 workbench', async () => {
    await act(async () => {
      root.render(<App />)
    })

    await waitUntil(() => {
      expect(container.textContent).toContain('技能管理模块')
    })
    expect(container.textContent).toContain('技能管理')
    expect(container.textContent).toContain('用量监测')
  })

  it('无中央仓库数据时进入导入页', async () => {
    dataStore.hasCentralSkills.mockResolvedValue(false)

    await act(async () => {
      root.render(<App />)
    })

    await waitUntil(() => {
      expect(container.textContent).toContain('导入页')
    })
  })

  it('初始化检查异常时回退到导入页', async () => {
    dataStore.hasCentralSkills.mockRejectedValue(new Error('scan failed'))

    await act(async () => {
      root.render(<App />)
    })

    await waitUntil(() => {
      expect(container.textContent).toContain('导入页')
    })
  })

  it('支持从技能管理切到用量监测并切回', async () => {
    await act(async () => {
      root.render(<App />)
    })

    await waitUntil(() => {
      expect(container.textContent).toContain('技能管理模块')
    })

    const navButtons = container.querySelectorAll('.nav-item')
    const usageButton = [...navButtons].find((button) =>
      button.textContent.includes('用量监测')
    )
    const skillsButton = [...navButtons].find((button) =>
      button.textContent.includes('技能管理')
    )

    await act(async () => {
      usageButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitUntil(() => {
      expect(container.textContent).toContain('当前版本为模块占位')
    })

    await act(async () => {
      skillsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitUntil(() => {
      expect(container.textContent).toContain('技能管理模块')
    })
  })

  it('导入完成后可进入 workbench', async () => {
    dataStore.hasCentralSkills.mockResolvedValue(false)

    await act(async () => {
      root.render(<App />)
    })

    await waitUntil(() => {
      expect(container.textContent).toContain('导入页')
    })

    const importButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent.includes('完成导入')
    )

    await act(async () => {
      importButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitUntil(() => {
      expect(container.textContent).toContain('技能管理模块')
    })
  })

  it('首次进入 workbench 会初始化推送目标并清理标记', async () => {
    dataStore.isFirstEntryAfterImport.mockResolvedValue(true)
    dataStore.getLastImportedToolIds.mockReturnValue(['claude-code', 'cursor'])

    await act(async () => {
      root.render(<App />)
    })

    await waitUntil(() => {
      expect(dataStore.initPushTargetsAfterImport).toHaveBeenCalledWith([
        'claude-code',
        'cursor',
      ])
    })
    expect(dataStore.setFirstEntryAfterImport).toHaveBeenCalledWith(false)
  })
})
