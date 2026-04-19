/**
 * 定价注册表 spec 行为测试
 *
 * 负责：
 * - validatePricing 的合法/非法路径
 * - HARDCODED_PRICING_FALLBACK 自身通过 schema 校验
 * - 打包 pricing.json 通过 schema 校验
 *
 * @module 自动化测试/V0.16/tests/backend/pricingRegistry.behavior.test
 */

import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, it, expect } from 'vitest'

const require = createRequire(import.meta.url)

const pricingRegistryPath = path.resolve(
  process.cwd(),
  'electron/services/registries/pricingRegistry.js'
)
const packagedPricingPath = path.resolve(process.cwd(), 'src/config/pricing.json')

function loadFresh() {
  delete require.cache[pricingRegistryPath]
  return require(pricingRegistryPath)
}

describe('pricingRegistry', () => {
  describe('validatePricing', () => {
    it('合法 pricing 通过校验', () => {
      const { validatePricing } = loadFresh()
      const result = validatePricing({
        exchangeRate: 7.22,
        models: {
          'claude-opus-4-7': {
            displayName: 'Claude Opus 4.7',
            input: 5,
            output: 25,
            cacheRead: 0.5,
            cacheWrite: 6.25,
          },
        },
      })
      expect(result.valid).toBe(true)
    })

    it('非对象被拒', () => {
      const { validatePricing } = loadFresh()
      expect(validatePricing(null).valid).toBe(false)
      expect(validatePricing('str').valid).toBe(false)
      expect(validatePricing(123).valid).toBe(false)
    })

    it('exchangeRate 非正数被拒', () => {
      const { validatePricing } = loadFresh()
      expect(validatePricing({ exchangeRate: 0, models: { x: {} } }).valid).toBe(false)
      expect(validatePricing({ exchangeRate: -1, models: { x: {} } }).valid).toBe(false)
      expect(validatePricing({ models: { x: {} } }).valid).toBe(false)
    })

    it('models 必须是对象不能是数组', () => {
      const { validatePricing } = loadFresh()
      const result = validatePricing({
        exchangeRate: 7,
        models: [],
      })
      expect(result.valid).toBe(false)
    })

    it('models 不能为空对象', () => {
      const { validatePricing } = loadFresh()
      const result = validatePricing({ exchangeRate: 7, models: {} })
      expect(result.valid).toBe(false)
    })

    it('价格字段缺失或非数字被拒', () => {
      const { validatePricing } = loadFresh()
      const result = validatePricing({
        exchangeRate: 7,
        models: {
          'claude-opus-4-7': {
            input: 5,
            output: 'twenty-five', // 非数字
            cacheRead: 0.5,
            cacheWrite: 6.25,
          },
        },
      })
      expect(result.valid).toBe(false)
      expect(result.error).toMatch(/output/)
    })

    it('价格字段为负数被拒', () => {
      const { validatePricing } = loadFresh()
      const result = validatePricing({
        exchangeRate: 7,
        models: {
          'bad-model': { input: -1, output: 2, cacheRead: 0, cacheWrite: 0 },
        },
      })
      expect(result.valid).toBe(false)
    })

    it('cacheWrite 为 0 应允许（GPT 类模型常见）', () => {
      const { validatePricing } = loadFresh()
      const result = validatePricing({
        exchangeRate: 7,
        models: {
          'gpt-5': { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
        },
      })
      expect(result.valid).toBe(true)
    })

    it('displayName 非字符串被拒（可选字段，但存在必须合法）', () => {
      const { validatePricing } = loadFresh()
      const result = validatePricing({
        exchangeRate: 7,
        models: {
          'x': { displayName: 123, input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
        },
      })
      expect(result.valid).toBe(false)
    })
  })

  describe('HARDCODED_PRICING_FALLBACK', () => {
    it('兜底数据本身应通过 schema 校验', () => {
      const { validatePricing, HARDCODED_PRICING_FALLBACK } = loadFresh()
      expect(validatePricing(HARDCODED_PRICING_FALLBACK).valid).toBe(true)
    })

    it('兜底数据应包含 Opus 4.7', () => {
      const { HARDCODED_PRICING_FALLBACK } = loadFresh()
      expect(HARDCODED_PRICING_FALLBACK.models['claude-opus-4-7']).toBeDefined()
      expect(HARDCODED_PRICING_FALLBACK.models['claude-opus-4-7'].input).toBe(5.0)
      expect(HARDCODED_PRICING_FALLBACK.models['claude-opus-4-7'].output).toBe(25.0)
    })

    it('兜底数据应覆盖 Claude 三大模型 + Haiku 带日期后缀版', () => {
      const { HARDCODED_PRICING_FALLBACK } = loadFresh()
      const keys = Object.keys(HARDCODED_PRICING_FALLBACK.models)
      expect(keys).toContain('claude-opus-4-7')
      expect(keys).toContain('claude-sonnet-4-6')
      expect(keys).toContain('claude-haiku-4-5')
      expect(keys).toContain('claude-haiku-4-5-20251001')
    })
  })

  describe('spec 配置', () => {
    it('pricingRegistrySpec 包含所有必需字段', () => {
      const { pricingRegistrySpec } = loadFresh()
      expect(pricingRegistrySpec.name).toBe('pricing')
      expect(pricingRegistrySpec.remotePath).toBe('src/config/pricing.json')
      expect(pricingRegistrySpec.cacheFileName).toBe('pricing.cache.json')
      expect(pricingRegistrySpec.packaged).toBeTruthy()
      expect(pricingRegistrySpec.hardcoded).toBeTruthy()
      expect(typeof pricingRegistrySpec.validate).toBe('function')
    })

    it('打包的 pricing.json 必须通过 schema 校验', () => {
      const { validatePricing } = loadFresh()
      const packaged = require(packagedPricingPath)
      const result = validatePricing(packaged)
      expect(result.valid).toBe(true)
    })

    it('打包的 pricing.json 必须包含 Opus 4.7（保证功能不回退）', () => {
      const packaged = require(packagedPricingPath)
      expect(packaged.models['claude-opus-4-7']).toBeDefined()
    })
  })
})
