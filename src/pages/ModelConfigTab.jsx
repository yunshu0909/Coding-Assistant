/**
 * 模型配置与推理等级 Tab 组件
 *
 * 负责：
 * - 展示当前模型和推理等级配置
 * - 支持预设模型别名选择和自定义输入
 * - 支持推理等级切换（低/中/高）
 * - 读写 ~/.claude/settings.json 的 model 和 effortLevel 字段
 *
 * @module pages/ModelConfigTab
 */

import React, { useState, useEffect, useCallback } from 'react'
import Button from '../components/Button/Button'
import StateView from '../components/StateView/StateView'

// 预设模型别名列表
const PRESET_MODELS = [
  { id: 'opus[1m]', display: 'Opus (1M)', sublabel: '最强 · 1M' },
  { id: 'opus', display: 'Opus', sublabel: '最强 · 200K' },
  { id: 'sonnet', display: 'Sonnet', sublabel: '日常' },
  { id: 'sonnet[1m]', display: 'Sonnet (1M)', sublabel: '日常 · 1M' },
  { id: 'haiku', display: 'Haiku', sublabel: '快速' },
]

// 推理等级列表
const EFFORT_LEVELS = [
  { id: 'low', display: '低', desc: '快速响应，适合简单问答' },
  { id: 'medium', display: '中', desc: '平衡速度与质量，Claude 默认值' },
  { id: 'high', display: '高', desc: '深度思考，适合复杂编码任务' },
]

/**
 * Info 图标
 * @returns {JSX.Element}
 */
function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
}

/**
 * 模型配置与推理等级 Tab
 * @param {Object} props - 组件属性
 * @param {(message: string, type: string) => void} props.onToast - Toast 回调
 * @returns {JSX.Element}
 */
export default function ModelConfigTab({ onToast }) {
  // 当前模型值（null = 未配置）
  const [currentModel, setCurrentModel] = useState(null)
  // 当前推理等级值（null = 未配置）
  const [currentEffort, setCurrentEffort] = useState(null)
  // 模型是否已显式配置
  const [isModelConfigured, setIsModelConfigured] = useState(false)
  // 推理等级是否已显式配置
  const [isEffortConfigured, setIsEffortConfigured] = useState(false)
  // 初始加载中
  const [isLoading, setIsLoading] = useState(true)
  // 写入中（禁用所有交互）
  const [isSwitching, setIsSwitching] = useState(false)
  // 自定义输入框内容
  const [customInput, setCustomInput] = useState('')
  // 读取错误
  const [error, setError] = useState(null)

  /**
   * 加载模型配置
   */
  const loadConfig = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const result = await window.electronAPI.getModelConfig()

      if (result.success) {
        setCurrentModel(result.model)
        setCurrentEffort(result.effortLevel)
        setIsModelConfigured(result.isModelConfigured)
        setIsEffortConfigured(result.isEffortConfigured)
        // 模型值不匹配预设时，填入自定义输入框
        if (result.isModelConfigured && !PRESET_MODELS.some((m) => m.id === result.model)) {
          setCustomInput(result.model || '')
        }
      } else {
        setError({
          type: result.errorCode || 'READ_ERROR',
          message: result.error || '无法读取配置',
        })
      }
    } catch (err) {
      setError({
        type: 'READ_ERROR',
        message: err?.message || '加载配置失败',
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  /**
   * 选择预设模型
   * @param {string} modelId - 模型别名
   * @param {string} displayName - 显示名称
   */
  const handleSelectModel = async (modelId, displayName) => {
    // 幂等保护
    if (modelId === currentModel && isModelConfigured) return
    if (isSwitching) return

    try {
      setIsSwitching(true)
      const result = await window.electronAPI.setModelConfig('model', modelId)

      if (result.success) {
        setCurrentModel(modelId)
        setIsModelConfigured(true)
        setCustomInput('')
        onToast(`已切换默认模型为「${displayName}」`, 'success')
      } else {
        onToast(result.error || '切换失败，无法写入配置文件', 'error')
      }
    } catch (err) {
      onToast(err?.message || '切换失败', 'error')
    } finally {
      setIsSwitching(false)
    }
  }

  /**
   * 应用自定义模型
   */
  const handleApplyCustomModel = async () => {
    const val = customInput.trim()
    if (!val) {
      onToast('请输入模型标识', 'error')
      return
    }
    if (isSwitching) return

    try {
      setIsSwitching(true)
      const result = await window.electronAPI.setModelConfig('model', val)

      if (result.success) {
        setCurrentModel(val)
        setIsModelConfigured(true)
        onToast(`已切换默认模型为「${val}」`, 'success')
      } else {
        onToast(result.error || '切换失败，无法写入配置文件', 'error')
      }
    } catch (err) {
      onToast(err?.message || '切换失败', 'error')
    } finally {
      setIsSwitching(false)
    }
  }

  /**
   * 选择推理等级
   * @param {string} effortId - 推理等级标识
   * @param {string} displayName - 显示名称
   */
  const handleSelectEffort = async (effortId, displayName) => {
    if (effortId === currentEffort && isEffortConfigured) return
    if (isSwitching) return

    try {
      setIsSwitching(true)
      const result = await window.electronAPI.setModelConfig('effortLevel', effortId)

      if (result.success) {
        setCurrentEffort(effortId)
        setIsEffortConfigured(true)
        onToast(`已切换推理等级为「${displayName}」`, 'success')
      } else {
        onToast(result.error || '切换失败，无法写入配置文件', 'error')
      }
    } catch (err) {
      onToast(err?.message || '切换失败', 'error')
    } finally {
      setIsSwitching(false)
    }
  }

  /**
   * 获取模型显示名称
   * @returns {string}
   */
  const getModelDisplayName = () => {
    if (!isModelConfigured) return '跟随账户默认'
    const preset = PRESET_MODELS.find((m) => m.id === currentModel)
    return preset?.display || currentModel || '跟随账户默认'
  }

  /**
   * 获取推理等级显示名称
   * @returns {string}
   */
  const getEffortDisplayName = () => {
    if (!isEffortConfigured) return '中'
    const level = EFFORT_LEVELS.find((l) => l.id === currentEffort)
    return level?.display || currentEffort || '中'
  }

  /**
   * 渲染状态卡片
   * @returns {JSX.Element}
   */
  const renderStatusCard = () => (
    <section className="model-status" data-testid="model-status-card">
      <div className="model-status-item">
        <span className="status-label">当前模型</span>
        <span className="status-value">{getModelDisplayName()}</span>
        <span className="status-meta">
          {isModelConfigured ? currentModel : '未显式配置，跟随账户默认'}
        </span>
      </div>
      <div className="model-status-item">
        <span className="status-label">推理等级</span>
        <span className="status-value">{getEffortDisplayName()}</span>
        <span className="status-meta">
          {isEffortConfigured ? currentEffort : '未显式配置，使用 Claude 默认值'}
        </span>
      </div>
    </section>
  )

  /**
   * 判断模型是否匹配预设列表
   * @param {string} modelId - 模型 ID
   * @returns {boolean}
   */
  const isPresetSelected = (modelId) => {
    // 未配置时不高亮任何预设
    if (!isModelConfigured) return false
    return currentModel === modelId
  }

  /**
   * 自定义输入回车处理
   * @param {React.KeyboardEvent} e - 键盘事件
   */
  const handleCustomKeyDown = (e) => {
    if (e.key === 'Enter') handleApplyCustomModel()
  }

  return (
    <StateView
      loading={isLoading}
      error={error?.message}
      onRetry={loadConfig}
      loadingMessage="正在读取配置..."
    >
      {renderStatusCard()}

      <div className="config-header">
        <h2 className="section-title" style={{ marginBottom: 0 }}>配置</h2>
        <span className="section-hint">
          <InfoIcon />
          仅适用于 Claude 原生接入
        </span>
      </div>

      <div className="model-grid">
        {/* 左列：默认模型 */}
        <div className="model-column">
          <div className="column-title">默认模型</div>
          <div className="radio-list">
            {PRESET_MODELS.map((model) => (
              <label
                key={model.id}
                className={`radio-item ${isPresetSelected(model.id) ? 'is-selected' : ''} ${isSwitching ? 'is-disabled' : ''}`}
                onClick={() => !isSwitching && handleSelectModel(model.id, model.display)}
                data-testid={`model-radio-${model.id}`}
              >
                <span className="radio-circle" />
                <span className="radio-label">{model.id}</span>
                <span className="radio-sublabel">{model.sublabel}</span>
              </label>
            ))}
          </div>

          <div className="custom-input-area">
            <div className="custom-input-row">
              <input
                className="custom-input"
                type="text"
                placeholder="自定义，如 claude-opus-4-6"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={handleCustomKeyDown}
                disabled={isSwitching}
                data-testid="model-custom-input"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleApplyCustomModel}
                disabled={isSwitching}
                data-testid="model-custom-apply"
              >
                应用
              </Button>
            </div>
          </div>
        </div>

        {/* 右列：推理等级 */}
        <div className="model-column">
          <div className="column-title">推理等级</div>
          <div className="radio-list">
            {EFFORT_LEVELS.map((level) => (
              <React.Fragment key={level.id}>
                <label
                  className={`radio-item ${(isEffortConfigured ? currentEffort === level.id : level.id === 'medium') ? 'is-selected' : ''} ${isSwitching ? 'is-disabled' : ''}`}
                  onClick={() => !isSwitching && handleSelectEffort(level.id, level.display)}
                  data-testid={`effort-radio-${level.id}`}
                >
                  <span className="radio-circle" />
                  <span className="radio-label radio-label--text">{level.display}</span>
                </label>
                <div className="effort-desc-text">{level.desc}</div>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </StateView>
  )
}
