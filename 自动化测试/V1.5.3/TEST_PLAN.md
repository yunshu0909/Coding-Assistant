# TEST_PLAN（V1.5.3）- 远程配置防退化闭环修复

## 1. 测试范围

- PRD：`docs/prd-v1.5.3-remote-config-anti-regression.md`
- 范围内：
  - 启动加载时 stale cache 不得覆盖新版 packaged。
  - 后台刷新时 stale jsDelivr 不得阻断 GitHub Raw。
  - 所有远程源均退化时不得写 cache。
  - `pricing.json` 必须包含 GPT-5.5 标准短上下文定价。
  - `costCalculator` 对 `gpt-5.5` 能输出具体费用。
- 非范围：
  - GPT-5.5 长上下文分档。
  - Usage 聚合链路重构。
  - Electron UI 像素级验证。

## 2. 完成门槛

1. 计划内自动化用例全部通过。
2. P0 用例通过率 100%。
3. 主相关回归 `test:v16:backend` 通过。
4. 生产构建 `npm run build` 通过。
5. 无阻断/严重缺陷遗留。

## 3. 用例清单

### Unit

- UT-01：cache 比 packaged 旧时，`loadEffective` 返回 packaged。
- UT-02：cache 比 packaged 新时，`loadEffective` 返回 cache。
- UT-03：stale cache 被 packaged 自愈覆盖。
- UT-04：jsDelivr 返回旧版、GitHub Raw 返回新版时，`fetchRemote` 返回 GitHub Raw。
- UT-05：所有远程源都旧时，`refreshRemoteConfigInBackground` 不写 cache。

### Integration

- IT-01：`pricing.json` 含 `gpt-5-5`，价格为 input 5、cacheRead 0.5、output 30。
- IT-02：`calculateCosts([{ name: 'gpt-5.5', ... }])` 返回非空费用。
- IT-03：未知模型仍返回 `null` 费用。

### E2E

- 本版不新增自动化 E2E。原因：核心缺陷在主进程远程配置加载策略，Node 测试可稳定覆盖；UI 显示通过人工补测兜底。

## 4. 自动化边界

- A（全自动）：
  - remote-config 版本比较。
  - stale cache / stale remote fallback。
  - pricing 与 costCalculator 命中链路。
- H（人工验证）：
  - 开发环境真实启动日志。
  - Usage 页面费用列视觉显示。
- A+H（联合）：
  - jsDelivr 边缘节点延迟场景：自动化模拟，真实网络人工观察。

## 5. 执行顺序

1. `npm run test:v153`
2. `npm run test:v16:backend`
3. `npm run build`

## 6. 输出产物

- `自动化测试/V1.5.3/TEST_REPORT.md`
- 命令执行结果摘要

