# TEST_CASES（V0.6）- PRD 分阶段执行级用例

## 1. 文档目标
- 目的：把 V0.6 测试从“结构可见性”升级为“行为正确性 + 口径正确性 + 异常可恢复性”。
- 依据：`/Users/wuhaoyang/Documents/trae_projects/skills/docs/prd/PRD-Skill-Manager-V0.6-用量监测.md`
- 范围：仅 V0.6 用量监测（不含 V0.4/V0.5 功能域）。

## 2. PRD 关键规则（测试基线）
- 时间窗口（北京时间 UTC+8）：
  - `today`: `[今日 00:00, 当前时刻)`
  - `week`: `[今日-7天 00:00, 今日 00:00)`，不含今日
  - `month`: `[今日-30天 00:00, 今日 00:00)`，不含今日
- 刷新策略：
  - 今日每 5 分钟自动重算
  - 近7天/近30天每日北京时间 `00:05` 重算
  - 周期切换仅切展示，不触发重算
- 聚合规则：
  - 总 Token = 输入 + 输出 + cache_read + cache_create
  - 模型数 `<=5`：饼图展示全部模型
  - 模型数 `>5`：饼图展示 Top5 + 其他，明细表仍全量
- 异常规则：
  - 数据源缺失、日志坏行、刷新失败必须可见反馈，页面不可崩溃
  - 刷新失败若有旧数据，需保留旧数据

## 3. 固定测试夹具（建议）
### 3.1 时间夹具
- 固定系统时间：`2026-02-15 11:00:00 +08:00`
- 用于验证 today/week/month 的边界行为。

### 3.2 日志夹具（最小可复现）
- `L1` `2026-02-15T00:00:00+08:00`（今日边界）
- `L2` `2026-02-15T01:00:00+08:00`（今日窗口内）
- `L3` `2026-02-14T23:59:59+08:00`（week/month 上界前一秒）
- `L4` `2026-02-08T00:00:00+08:00`（week 起始边界）
- `L5` `2026-01-16T00:00:00+08:00`（month 起始边界）
- `L6` 坏行（非法 JSON）
- `L7` 0 消耗记录（输入/输出/缓存全 0）

---

## 4. 阶段一：数据准备与场景判定（US-01）

### TC-S1-BE-01（P0）时间窗口口径-今日
- 类型：后端 Unit
- 覆盖 PRD：1.4.3 时间口径 / US-01
- 目标：确保 `today` 严格统计 `[今日00:00, 当前时刻)`。
- 前置条件：系统时间固定到 `2026-02-15 11:00 +08`。
- 输入数据：`L1 L2 L3`。
- 步骤：
  1. 调用 `aggregateUsage('today')`。
  2. 读取 `recordCount/startTime/endTime/models`。
- 后端断言：
  - 包含 `L1/L2`，不包含 `L3`。
  - `startTime = 2026-02-14T16:00:00.000Z`。
  - `endTime` 小于等于当前时刻 UTC。
- 前端断言：
  - 指标区与图例仅反映 `L1/L2` 对应模型。
- 失败判定：出现 `L3` 被计入即失败。
- 自动化：已落地 `usageAggregator.v06.prd-window.test.js`。

### TC-S1-BE-02（P0）时间窗口口径-近7天
- 类型：后端 Unit
- 覆盖 PRD：1.4.3 时间口径 / US-01
- 目标：确保 `week` 为 `[今日-7天00:00, 今日00:00)`。
- 前置条件：固定系统时间。
- 输入数据：`L1 L3 L4`。
- 步骤：调用 `aggregateUsage('week')`。
- 后端断言：
  - 包含 `L4/L3`。
  - 不包含 `L1`（今日边界）。
- 前端断言：切到“近7天”后展示不含今日数据。
- 失败判定：今日记录进入 week 即失败。
- 自动化：已落地。

### TC-S1-BE-03（P0）时间窗口口径-近30天
- 类型：后端 Unit
- 覆盖 PRD：1.4.3 时间口径 / US-01
- 目标：确保 `month` 为 `[今日-30天00:00, 今日00:00)`。
- 输入数据：`L1 L3 L4 L5`。
- 步骤：调用 `aggregateUsage('month')`。
- 后端断言：包含 `L5/L4/L3`，不包含 `L1`。
- 前端断言：切到“近30天”后展示不含今日数据。
- 自动化：已落地。

### TC-S1-BE-04（P0）日志扫描边界 `[start, end)`
- 类型：后端 Unit
- 覆盖 PRD：统一时间窗口
- 目标：确认文件时间过滤半开区间，避免边界重复。
- 输入：文件 mtime = start、in-window、end。
- 步骤：调用 `scanLogFilesInRange`。
- 后端断言：命中 start/in-window，排除 end。
- 自动化：已落地 `logScanner.v06.behavior.test.js`。

### TC-S1-BE-05（P0）大目录截断行为稳定
- 类型：后端 Unit
- 覆盖 PRD：可预测、可复现
- 目标：文件过多时返回可观测截断状态，且保留最新文件。
- 输入：3 文件，mtime 递增，`maxFiles=2`。
- 步骤：调用扫描。
- 后端断言：返回 newest + middle，`truncated=true`。
- 自动化：已落地。

### TC-S1-FE-01（P0）首次进入预热三周期
- 类型：前端 Unit
- 覆盖 PRD：用户进入后可预测展示
- 目标：首次进入页面即准备 today/week/month 缓存。
- 前置：`aggregateUsage` mock 成功。
- 步骤：渲染 `UsageMonitorPage`。
- 前端断言：`aggregateUsage` 被调用 `today/week/month` 各 1 次。
- 自动化：已落地 `UsageMonitorPage.v06.refresh-policy.test.jsx`。

### TC-S1-FE-02（P0）周期切换不触发重算
- 类型：前端 Unit + Integration
- 覆盖 PRD：周期切换仅切展示
- 目标：切换周期不卡顿，且不新增聚合调用。
- 步骤：首次预热后点击 `今日 -> 近7天 -> 近30天`。
- 前端断言：新增调用次数 = 0。
- 自动化：已落地（Unit：`UsageMonitorPage.v06.refresh-policy.test.jsx`；Integration：`App.usage-v06.flow.test.jsx`）。

### TC-S1-E-01（P1）日志坏行容错
- 类型：后端 Unit
- 覆盖 PRD：坏行跳过
- 输入：`L6` + 合法日志。
- 步骤：执行聚合。
- 断言：坏行不影响总结果，流程不中断。
- 自动化：已落地 `usageAggregator.v06.behavior.test.js`。

---

## 5. 阶段二：正常场景展示（US-02，模型数 <= 5）

### TC-S2-FE-01（P0）指标卡渲染正确
- 类型：前端 Unit/E2E
- 目标：总 Token、输入、输出、缓存命中可见且值匹配。
- 输入：3 模型正常数据。
- 步骤：渲染页面。
- 前端断言：四个指标存在且数值格式化正确。
- 自动化：已落地（Unit：`UsageMonitorPage.v06.display-and-error.test.jsx`；E2E：`usage-monitor.v06.smoke.spec.js`）。

### TC-S2-FE-02（P0）饼图显示全部模型
- 类型：前端 Unit
- 目标：`<=5` 模型时不出现“其他”。
- 输入：3 模型分布。
- 步骤：渲染图例。
- 前端断言：图例项=3，无“其他”。
- 自动化：已落地 `UsageMonitorPage.v06.display-and-error.test.jsx`。

### TC-S2-BE-01（P0）总 Token 公式
- 类型：后端 Unit
- 目标：`total = input + output + cacheRead + cacheCreate`。
- 输入：明确字段值记录。
- 步骤：聚合。
- 后端断言：总值精确匹配。
- 自动化：已落地 `usageAggregator.v06.behavior.test.js`。

### TC-S2-BE-02（P0）0 消耗模型过滤
- 类型：后端 Unit
- 目标：总消耗 0 模型不进入 models/distribution。
- 输入：`L7` + 正常记录。
- 后端断言：`L7` 模型不展示。
- 自动化：已落地（聚合测试中覆盖）。

### TC-S2-E-01（P1）空窗口展示
- 类型：前端 Unit/E2E
- 目标：无数据时显示 0 和空态，不崩溃。
- 输入：聚合返回空模型。
- 前端断言：表格显示“暂无数据”。
- 自动化：已落地 `UsageMonitorPage.v06.display-and-error.test.jsx`。

---

## 6. 阶段三：极端场景展示（US-03，模型数 > 5）

### TC-S3-BE-01（P0）Top5+其他聚合正确
- 类型：后端 Unit
- 目标：分布项应为 6（Top5 + 其他）。
- 输入：12 模型、可区分 token。
- 步骤：聚合并读取 distribution。
- 后端断言：Top5 模型正确，其他求和正确。
- 自动化：已落地 `usageAggregator.v06.behavior.test.js`。

### TC-S3-BE-02（P0）并列稳定排序
- 类型：后端 Unit
- 目标：相同 total 时按模型名升序，避免 Top5 抖动。
- 输入：多模型 total 一致。
- 后端断言：顺序稳定，可重复。
- 自动化：已落地 `usageAggregator.v06.behavior.test.js`。

### TC-S3-FE-01（P0）极端场景图表与明细一致
- 类型：前端 Unit/E2E
- 目标：图表 6 项，明细仍全量。
- 输入：模型数>5。
- 前端断言：图表为 Top5+其他；明细行数=全模型数。
- 自动化：已落地 `UsageMonitorPage.v06.display-and-error.test.jsx`。

### TC-S3-E-01（P1）“其他 0%”不展示
- 类型：前端 Unit
- 目标：避免噪音文案。
- 输入：smallModels 总和 0。
- 前端断言：图例不出现“其他 0%”。
- 自动化：已落地（聚合：`usageAggregator.v06.behavior.test.js`；展示：`UsageMonitorPage.v06.display-and-error.test.jsx`）。

---

## 7. 阶段四：异常与降级处理（US-04）

### TC-S4-FE-01（P0）今日 5 分钟刷新
- 类型：前端 Unit
- 目标：`today` 到 5 分钟触发一次重算。
- 前置：fake timers + 当前周期 today。
- 步骤：推进 4 分钟，再推进 1 分钟。
- 前端断言：第 5 分钟触发 1 次 today 调用。
- 自动化：已落地。

### TC-S4-FE-02（P0）7天/30天 00:05 刷新
- 类型：前端 Unit
- 目标：仅在 00:05 后触发 week/month 重算。
- 前置：系统时间 00:04。
- 步骤：推进 1 分钟到 00:05。
- 前端断言：触发 week + month 调用。
- 自动化：已落地。

### TC-S4-FE-03（P0）刷新失败保留旧数据
- 类型：前端 Unit
- 目标：失败不丢数据。
- 前置：先成功生成缓存，再 mock 聚合失败。
- 步骤：触发自动刷新。
- 前端断言：显示“刷新失败，显示上次数据”，旧数据仍可见。
- 自动化：已落地 `UsageMonitorPage.v06.display-and-error.test.jsx`。

### TC-S4-FE-04（P1）首次失败空态兜底
- 类型：前端 Unit
- 目标：首次失败不可白屏。
- 输入：无缓存 + 聚合失败。
- 前端断言：错误提示 + 空态。
- 自动化：已落地 `UsageMonitorPage.v06.display-and-error.test.jsx`。

### TC-S4-BE-01（P1）权限异常返回
- 类型：后端 Integration
- 目标：EACCES/EPERM 返回统一错误码。
- 步骤：mock 扫描权限错误。
- 后端断言：`PERMISSION_DENIED`。
- 自动化：已落地 `scanLogFilesHandler.v06.error-handling.test.js`。

### TC-S4-BE-02（P1）数据源缺失降级
- 类型：后端 Integration
- 目标：目录不存在时返回 success + 空数据。
- 步骤：扫描不存在路径。
- 后端断言：`success=true files=[]`。
- 自动化：已落地 `scanLogFilesHandler.v06.error-handling.test.js`。

---

## 8. 集成与 E2E 用例（跨阶段）

### TC-IT-01（P0）导航链路
- 步骤：工作台点击“用量监测”。
- 断言：周期入口、图表标题、明细标题均出现。
- 自动化：已落地。

### TC-IT-02（P0）占位态替换
- 步骤：进入用量页。
- 断言：不出现“当前版本为模块占位”。
- 自动化：已落地。

### TC-IT-03（P0）切换行为
- 步骤：切换三个周期。
- 断言：页面可切换，不卡死，不重算。
- 自动化：已落地（Unit：`UsageMonitorPage.v06.refresh-policy.test.jsx`；Integration：`App.usage-v06.flow.test.jsx`）。

### TC-E2E-01（P0）入口可见
- 步骤：Electron 真机流程进入页面。
- 断言：今日/近7天/近30天可见。
- 自动化：已落地。

### TC-E2E-02（P0）核心指标可见
- 步骤：进入页面。
- 断言：总 Token/输入/输出/缓存命中可见。
- 自动化：已落地。

### TC-E2E-03（P0）明细与非占位
- 步骤：进入页面。
- 断言：模型用量明细可见、占位文案消失。
- 自动化：已落地。

---

## 9. 自动化落地映射（当前状态）
- 已实现：
  - `自动化测试/V0.6/tests/unit/electron/logScanner.v06.behavior.test.js`
  - `自动化测试/V0.6/tests/unit/electron/scanLogFilesHandler.v06.error-handling.test.js`
  - `自动化测试/V0.6/tests/unit/store/usageAggregator.v06.prd-window.test.js`
  - `自动化测试/V0.6/tests/unit/store/usageAggregator.v06.behavior.test.js`
  - `自动化测试/V0.6/tests/unit/pages/UsageMonitorPage.v06.refresh-policy.test.jsx`
  - `自动化测试/V0.6/tests/unit/pages/UsageMonitorPage.v06.display-and-error.test.jsx`
  - `自动化测试/V0.6/tests/unit/components/UsageMonitorModule.v06.contract.test.jsx`
  - `自动化测试/V0.6/tests/integration/App.usage-v06.flow.test.jsx`
  - `自动化测试/V0.6/tests/e2e/usage-monitor.v06.smoke.spec.js`
- 当前执行结果：
  - 执行时间：2026-02-15
  - `npm run test:v06`：`33/33` 通过
  - `npm run test:v06:all`：通过（Unit/Integration `33/33`，E2E `3/3`）

## 10. 发布门禁（必须通过）
- 口径门禁：TC-S1-BE-01/02/03/04/05
- 刷新门禁：TC-S4-FE-01/02
- 页面门禁：TC-S2-FE-01 + TC-IT-01 + TC-E2E-01/02/03
- 失败任一 P0 用例，不得发布。
