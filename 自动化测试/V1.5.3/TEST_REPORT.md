# TEST_REPORT（V1.5.3）- 远程配置防退化闭环修复

## 1. 结果摘要

- 日期：2026-04-25
- PRD：`docs/prd-v1.5.3-remote-config-anti-regression.md`
- 结论：`PASS`
- 范围：remote-config Unit + pricing/costCalculator Integration + 生产构建 + 线上远程源 smoke

## 2. 执行命令与结果

- `npm run test:v153`
  - result：`PASS`
  - Test Files：`1 passed`
  - Tests：`7 passed`

- `npm run test:v16:backend`
  - result：`PASS`
  - Test Files：`5 passed`
  - Tests：`61 passed`

- `npm run build`
  - result：`PASS`
  - 说明：构建成功；仅保留既有 Vite chunk size warning。

- live smoke：`fetchRemote(pricingRegistrySpec)`
  - result：`PASS`
  - 结果：jsDelivr 返回旧 `2026-04-18` 时被跳过，GitHub Raw 返回 `2026-04-25`，且包含 `gpt-5-5`。

- init smoke：旧 `pricing.cache.json` + `initRemoteConfig(pricingRegistrySpec)`
  - result：`PASS`
  - 结果：初始化选择 packaged `2026-04-25`，运行态包含 `gpt-5-5`，旧 cache 被自愈为 `2026-04-25`。

## 3. 分层覆盖结果

- Unit：`5/5 passed`
  - 旧 cache 不覆盖新版 packaged。
  - 新 cache 仍优先于 packaged。
  - stale cache 自动用 packaged 自愈。
  - stale jsDelivr 会 fallback 到 GitHub Raw。
  - 所有远程源都旧时不写 cache。

- Integration：`3/3 passed`
  - `pricing.json` 包含 GPT-5.5 标准短上下文价格。
  - `calculateCosts` 能将 `gpt-5.5` 归一化命中 `gpt-5-5` 并算出 `$26.321`。
  - 未知模型仍返回未知费用，不误套 GPT-5.5 价格。

- E2E：`0/0`
  - 本版不新增自动化 E2E。核心缺陷在主进程配置加载策略，已由 Node 测试覆盖。

## 4. 失败用例

- 无。

## 5. 本轮修复点

- `loadEffective` 从固定 `cache > packaged > hardcoded` 改为版本安全加载。
- stale cache 被识别后，本次运行使用 packaged，并尝试用 packaged 覆盖旧 cache。
- `fetchRemote` 在 schema 校验后增加版本退化判断，旧 jsDelivr 不再阻断 GitHub Raw。
- `REMOTE_VERSION_STALE` 从“写 cache 时才发现”前移到远程源选择阶段。
- 新增 V1.5.3 专项测试，并更新 V0.16 remote-config 基线测试适配新策略。

## 6. 剩余风险（人工补测）

- 建议重启 dev app，确认日志从旧行为：
  - `[pricing] loaded from cache, version=2026-04-18`
  变为新行为：
  - `[pricing] cached version stale (cache=2026-04-18, packaged=2026-04-25), using packaged`
  - `[pricing] loaded from packaged, version=2026-04-25`
- 建议进入 Usage 页面，人工确认 `gpt-5.5` 费用列不再显示 `--`。

## 7. 发布门禁

- 门禁检查状态：`PASS`
- 最终决策：可以进入下一步提交/发版。
