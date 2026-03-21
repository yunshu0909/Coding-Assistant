/**
 * 费用计算模块
 *
 * 负责：
 * - 基于 pricing.json 计算各模型的预估费用（人民币）
 * - 模型名归一化（展示名 → 定价表 key）
 * - 费用格式化显示
 *
 * @module store/costCalculator
 */

import pricingData from '../config/pricing.json';

const { exchangeRate, models: pricingModels } = pricingData;

/**
 * 将模型展示名转换为定价表 key
 * 规则：小写 + 空格→连字符 + 点→连字符
 * @param {string} name - 模型展示名（如 "Claude Opus 4.6"）
 * @returns {string} 定价表 key（如 "claude-opus-4-6"）
 */
function normalizeModelKey(name) {
  return name.toLowerCase().replace(/[\s.]+/g, '-');
}

/**
 * 计算每个模型的预估费用（人民币）
 * @param {Array<{name: string, input: number, output: number, cacheRead: number, cacheCreate: number}>} models
 * @returns {{ totalCost: number|null, modelCosts: Map<string, number|null> }}
 */
export function calculateCosts(models) {
  if (!models || models.length === 0) {
    return { totalCost: null, modelCosts: new Map() };
  }

  const modelCosts = new Map();
  let totalUsd = 0;
  let hasKnown = false;

  for (const model of models) {
    const key = normalizeModelKey(model.name);
    const pricing = pricingModels[key];

    if (!pricing) {
      modelCosts.set(model.name, null);
      continue;
    }

    // 美元费用 = 各维度 token × 对应单价 / 百万
    const usdCost = (
      (model.input || 0) * pricing.input +
      (model.output || 0) * pricing.output +
      (model.cacheRead || 0) * pricing.cacheRead +
      (model.cacheCreate || 0) * pricing.cacheWrite
    ) / 1_000_000;

    modelCosts.set(model.name, usdCost);
    totalUsd += usdCost;
    hasKnown = true;
  }

  return {
    totalCost: hasKnown ? totalUsd : null,
    modelCosts
  };
}

/**
 * 格式化费用显示
 * @param {number|null} cost - 费用值（美元）
 * @returns {string} "$12.35" 或 "--"
 */
export function formatCost(cost) {
  if (cost === null || cost === undefined) return '--';
  return '$' + cost.toFixed(2);
}
