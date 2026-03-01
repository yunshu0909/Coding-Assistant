/**
 * 版本管理详情面板
 *
 * 负责：
 * - 展示当前版本号、安装方式、更新器状态
 * - 新版本可用时显示蓝色更新横幅
 * - 更新失败时横幅变红 + 重试
 * - 「检查更新」「Doctor 检查」按钮
 *
 * @module pages/claude-code/VersionPanel
 */

import React from 'react'
import Button from '../../components/Button/Button'
import Tag from '../../components/Tag/Tag'

/**
 * 版本管理面板
 * @param {Object} props
 * @param {Object} props.versionInfo - 版本信息 { version, updated, newVersion, alreadyLatest, doctorHealthy, doctorDetails }
 * @param {boolean} props.updating - 是否正在更新
 * @param {boolean} props.doctoring - 是否正在执行 Doctor
 * @param {string|null} props.updateError - 更新失败错误信息
 * @param {Function} props.onCheckUpdate - 检查更新回调
 * @param {Function} props.onDoctor - Doctor 检查回调
 * @param {string|null} props.lastCheckTime - 上次检查时间
 * @returns {React.ReactElement}
 */
export default function VersionPanel({
  versionInfo,
  updating,
  doctoring,
  updateError,
  onCheckUpdate,
  onDoctor,
  lastCheckTime,
}) {
  const { version, newVersion, alreadyLatest, doctorHealthy, doctorDetails } = versionInfo || {}

  // 更新器状态标签
  const doctorTag = doctorHealthy === true
    ? <Tag variant="success">健康</Tag>
    : doctorHealthy === false
      ? <Tag variant="warning">异常</Tag>
      : <Tag variant="default">未检查</Tag>

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <span className="detail-title">版本管理</span>
        <div className="detail-actions">
          <Button
            variant="secondary"
            size="sm"
            loading={doctoring}
            onClick={onDoctor}
          >
            Doctor 检查
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={updating}
            onClick={onCheckUpdate}
          >
            检查更新
          </Button>
        </div>
      </div>

      <div className="detail-body">
        {/* 更新横幅：有新版本可用 */}
        {newVersion && !alreadyLatest && !updateError && (
          <div className="update-banner">
            <div className="update-banner-icon">↑</div>
            <div className="update-banner-text">
              <div className="update-banner-title">新版本可用: v{newVersion}</div>
              <div className="update-banner-desc">建议更新以获取最新功能和修复</div>
            </div>
            <Button variant="primary" size="sm" loading={updating} onClick={onCheckUpdate}>
              立即更新
            </Button>
          </div>
        )}

        {/* 更新失败横幅 */}
        {updateError && (
          <div className="update-banner error">
            <div className="update-banner-icon">!</div>
            <div className="update-banner-text">
              <div className="update-banner-title">更新失败</div>
              <div className="update-banner-desc">{updateError}</div>
            </div>
            <Button variant="secondary" size="sm" loading={updating} onClick={onCheckUpdate}>
              重试
            </Button>
          </div>
        )}

        <div className="info-group">
          <div className="info-group-title">当前版本</div>
          <div className="info-row">
            <span className="info-label">版本号</span>
            <span className="info-value">
              <code>{version || '未知'}</code>
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">更新器状态</span>
            <span className="info-value">{doctorTag}</span>
          </div>
        </div>

        {/* Doctor 详情（有内容时展示） */}
        {doctorDetails && (
          <div className="info-group">
            <div className="info-group-title">Doctor 检查详情</div>
            <div style={{
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.5,
            }}>
              {doctorDetails}
            </div>
          </div>
        )}
      </div>

      <div className="detail-footer">
        <span className="detail-footer-text">
          {lastCheckTime ? `上次检查: ${lastCheckTime}` : ''}
        </span>
      </div>
    </div>
  )
}
