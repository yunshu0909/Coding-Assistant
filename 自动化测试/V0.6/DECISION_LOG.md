# Decision Log - 2026-02-15（Codex 用量去重修复）

## 背景

- 需求/问题：用量监测中 `codex` 今日消耗明显偏大，和日志校核值不一致。
- 目标与验收：`codex` 统计应与日志累计快照一致，重复 `token_count` 快照不再导致翻倍。

## 现状（基于代码的事实）

- 原实现将 Codex `token_count` 解析为 `last_token_usage` 后逐条累加。
- 同一会话会重复上报相同累计快照，导致重复计数。
- 受影响路径：`src/store/logParser.js`、`src/store/usageAggregator.js`。

## 决策

- 选择的方案：Codex 改为“按 session 累计快照做窗口增量”。
- 关键改动点（文件/模块级别）：
  - `src/store/logParser.js`：新增 `parseCodexTokenSnapshot`，解析 `total_token_usage` 累计字段。
  - `src/store/usageAggregator.js`：按 session 维护 `beforeWindow` 与 `inWindow` 最大累计快照，最终用差值得到窗口增量。
  - `自动化测试/V0.6/tests/unit/store/usageAggregator.v06.behavior.test.js`：新增 Codex 去重回归用例。
- 新增/调整的状态与边界处理：
  - 同 `total_tokens` 的重复快照只取一次。
  - 会话无窗口内增量时不计入结果。
  - 总量仍按 UI 公式：`input + output + cache`。

## 备选方案（被拒绝的）

- 方案 A：继续累计 `last_token_usage`，仅按“同 timestamp”去重。
  - 不选原因：重复快照不一定同 timestamp，去重不可靠。
- 方案 B：仅用 `total_token_usage.total_tokens` 单值展示。
  - 不选原因：会丢失 input/output/cache 细分，无法满足现有 UI 明细需求。

## 风险与缓解

- 风险：若某会话窗口前基线缺失，可能出现轻微高估。
- 缓解：使用“窗口前最大累计值”作为基线；无基线时回退到 0，且仅统计正增量。

## 回滚方案

- 如何回滚：回滚以下文件到修复前版本即可：
  - `src/store/logParser.js`
  - `src/store/usageAggregator.js`
  - `自动化测试/V0.6/tests/unit/store/usageAggregator.v06.behavior.test.js`
- 回滚后是否需要清理/修复数据：不需要（仅运行时聚合逻辑变更，无持久化迁移）。
