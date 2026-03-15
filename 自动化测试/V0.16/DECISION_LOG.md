# DECISION_LOG - 2026-03-15（V0.16 模型配置与推理等级自动化测试）

## 背景
- 目标：对 V0.16 新增的模型配置与推理等级能力补齐可回归的三层自动化（Backend + Integration + Electron E2E）。
- 约束：沿用既有 V0.12 的测试组织方式，不引入新测试框架。
- 方法：按 Happy / Error / Boundary / Regression 四路径组织用例，而非仅正向流程。

## 决策

### 1. 继续采用“分层脚本 + 总入口”执行策略
- 决策：新增 `test:v16:backend`、`test:v16:integration`、`test:e2e:v16`、`test:v16:all`。
- 原因：与既有版本保持一致，失败归因清晰，便于快速复跑。

### 2. Integration 测试直接挂载 PermissionModePage 并切换 Tab
- 决策：不单独挂载 `ModelConfigTab`，而是通过真实 Tab 切换进入模型配置页。
- 原因：可同时覆盖 Tab 容器与模型配置逻辑，降低“单组件测试与真实入口脱节”风险。

### 3. 后端测试采用“临时 HOME + 双模块 fresh require”
- 决策：每次测试切 HOME 到临时目录，并清理 `permissionModeHandlers` 与 `modelConfigHandlers` 缓存后重载。
- 原因：`modelConfigHandlers` 依赖 `permissionModeHandlers` 的路径常量，必须一起重载才能确保路径隔离生效。

### 4. E2E 聚焦高价值主链路，避免高波动系统权限注入
- 决策：E2E 覆盖“未配置落盘、自定义模型、解析错误重试”三条主路径。
- 原因：跨平台权限拒绝注入稳定性差，优先保证核心业务链路可持续回归。

## 备选方案与取舍
- 方案 A：只做前端 Integration，不做 Electron E2E。
  - 放弃原因：无法验证真实 `~/.claude/settings.json` 的落盘行为。
- 方案 B：只覆盖 Happy Path，减少用例数量。
  - 放弃原因：不满足本次明确要求的四路径覆盖。
