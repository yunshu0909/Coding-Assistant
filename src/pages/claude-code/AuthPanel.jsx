/**
 * 认证管理详情面板
 *
 * 负责：
 * - 展示登录状态、认证方式、订阅计划
 * - 未登录时显示红色警告条
 * - 「刷新状态」「重新登录」按钮
 *
 * @module pages/claude-code/AuthPanel
 */

import React from 'react'
import Button from '../../components/Button/Button'
import Tag from '../../components/Tag/Tag'

/**
 * 认证方式显示映射
 * @type {Object<string, string>}
 */
const AUTH_METHOD_LABEL = {
  oauth: 'OAuth',
  api_key: 'API Key',
}

/**
 * 订阅计划显示映射
 * @type {Object<string, string>}
 */
const PLAN_LABEL = {
  max: 'Max',
  pro: 'Pro',
  free: 'Free',
  team: 'Team',
  enterprise: 'Enterprise',
}

/**
 * 认证管理面板
 * @param {Object} props
 * @param {Object} props.authInfo - 认证信息 { loggedIn, authMethod, plan, rawOutput }
 * @param {boolean} props.refreshing - 是否正在刷新认证状态
 * @param {boolean} props.loggingIn - 是否正在执行登录
 * @param {Function} props.onRefresh - 刷新状态回调
 * @param {Function} props.onLogin - 重新登录回调
 * @param {string|null} props.lastCheckTime - 上次检查时间
 * @returns {React.ReactElement}
 */
export default function AuthPanel({
  authInfo,
  refreshing,
  loggingIn,
  onRefresh,
  onLogin,
  lastCheckTime,
}) {
  const { loggedIn, authMethod, plan } = authInfo || {}

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <span className="detail-title">认证管理</span>
        <div className="detail-actions">
          <Button
            variant="secondary"
            size="sm"
            loading={refreshing}
            onClick={onRefresh}
          >
            刷新状态
          </Button>
          {!loggedIn && (
            <Button
              variant="primary"
              size="sm"
              loading={loggingIn}
              onClick={onLogin}
            >
              重新登录
            </Button>
          )}
        </div>
      </div>

      <div className="detail-body">
        {/* 未登录警告条 */}
        {loggedIn === false && (
          <div className="auth-alert">
            ⚠️ 认证已失效，请重新登录
          </div>
        )}

        <div className="info-group">
          <div className="info-group-title">账户信息</div>
          <div className="info-row">
            <span className="info-label">登录状态</span>
            <span className="info-value">
              {loggedIn === true
                ? <Tag variant="success">已登录</Tag>
                : loggedIn === false
                  ? <Tag variant="danger">未登录</Tag>
                  : <Tag variant="default">未知</Tag>
              }
            </span>
          </div>
          {authMethod && (
            <div className="info-row">
              <span className="info-label">认证方式</span>
              <span className="info-value">
                {AUTH_METHOD_LABEL[authMethod] || authMethod}
              </span>
            </div>
          )}
          {plan && (
            <div className="info-row">
              <span className="info-label">订阅计划</span>
              <span className="info-value">
                <Tag variant="info">{PLAN_LABEL[plan] || plan}</Tag>
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="detail-footer">
        <span className="detail-footer-text">
          {lastCheckTime ? `上次验证: ${lastCheckTime}` : ''}
        </span>
      </div>
    </div>
  )
}
