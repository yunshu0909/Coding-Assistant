# TEST_REPORT（V0.6）- 复盘修订版

## 1. 结果摘要
- 日期：2026-02-15
- PRD：`/Users/wuhaoyang/Documents/trae_projects/skills/docs/prd/PRD-Skill-Manager-V0.6-用量监测.md`
- 结论：`PASS（修复后）`
- 说明：本轮在“原报告 PASS”基础上补充了统计口径与刷新策略复盘，确认存在实现偏差并已修复。

## 2. 本轮新增发现的问题（按严重度）

### P0-01：7天/30天统计被文件扫描上限截断
- 现象：`today` 数据看起来正常，但 `week/month` 明显偏小且不稳定。
- 影响：长周期统计漏算，成本判断失真。
- 根因：`scan-log-files` 在主进程硬编码 `maxFiles = 100`，达到上限后提前停止。
- 证据（修复前采样）：
  - `~/.claude/projects`：`today=11`，`week=100(命中上限)`，`month=100(命中上限)`。
- 修复：
  - 扫描流程改为“先收集候选 -> 按 mtime 倒序 -> 再读取”。
  - 上限提升为 `5000`，并返回 `totalMatched/scannedCount/truncated` 便于观测。

### P0-02：刷新策略与 PRD 不一致，导致切换卡顿
- 现象：切换到 `近7天/近30天` 时会重新扫描日志，页面切换慢。
- PRD 要求：
  - 今日：每 5 分钟重算。
  - 近7天/近30天：北京时间每日 `00:05` 重算。
  - 周期切换仅切展示，不重算。
- 根因：旧实现在 `currentPeriod` 变化时直接触发 `loadUsageData`。
- 修复：
  - 引入按周期缓存（内存 + localStorage）。
  - 首次进入预热三个周期缓存。
  - 周期切换只切换视图，不触发重算。

### P1-03：时间窗口口径与 PRD 不一致
- 旧口径：
  - `week/month` 包含今日。
- PRD 口径：
  - `today`: `[今日00:00, 当前时刻)`
  - `week`: `[今日-7天00:00, 今日00:00)`（不含今日）
  - `month`: `[今日-30天00:00, 今日00:00)`（不含今日）
- 修复：
  - 聚合与文件过滤统一改为半开区间 `[start, end)`。
  - 北京时间窗口按 `Asia/Shanghai` 计算。

## 3. 修复内容清单
- `/Users/wuhaoyang/Documents/trae_projects/skills/skill-manager/electron/main.js`
  - 重写日志扫描逻辑（候选收集 + 倒序读取 + 截断可观测字段）。
  - 文件时间过滤改为半开区间 `[start, end)`。
- `/Users/wuhaoyang/Documents/trae_projects/skills/skill-manager/src/store/usageAggregator.js`
  - 时间窗口改为严格 PRD 口径。
  - 记录过滤改为半开区间 `[start, end)`。
  - 同 total 并列时按模型名升序，减少 TopN 抖动。
- `/Users/wuhaoyang/Documents/trae_projects/skills/skill-manager/src/pages/UsageMonitorPage.jsx`
  - 引入三周期缓存与刷新策略状态机。
  - 周期切换不重算，今日 5 分钟重算，7天/30天按每日 00:05 批次重算。

## 4. 执行命令与结果
- `npm run test:v06:all`
  - result: `PASS`
  - Unit `7/7`（含原 V0.6 契约测试）
  - E2E `3/3`

### 专项行为验证（新增）
- 验证项1：仅切换周期不应触发扫描
  - 结果：`scanLogFiles` 调用次数 = `0`（通过）
- 验证项2：长周期不再触发 100 文件截断
  - `~/.claude/projects`：
    - `today`: `11`
    - `week`: `106`
    - `month`: `445`
  - `truncated=false`（通过）

## 5. 为什么旧测试报告没有测出问题
1. 现有 UT/IT/E2E 主要验证“结构文案可见”，未验证“统计行为正确”。
2. 未对刷新策略做调用次数断言（缺少 fake timer + spy）。
3. 未覆盖时间窗口边界样例（尤其 `week/month` 不含今日）。
4. TEST_PLAN 写了“刷新策略/时间口径”，但测试实现没有落到对应断言，导致“计划覆盖”与“自动化覆盖”脱节。

## 6. 剩余风险与补测计划
- 风险：
  - 当前“刷新策略正确性”验证主要通过脚本专项检查，尚未沉淀为正式自动化测试文件。
- 补测计划（建议作为 V0.6.1 测试增量）：
  1. 新增时间窗口边界单测（today/week/month）。
  2. 新增刷新策略单测（5分钟、00:05、周期切换不重算）。
  3. 新增固定日志夹具的数值快照测试（防止口径回退）。

## 7. 发布门禁
- 门禁检查状态：`通过（修复后）`
- 决策说明：核心偏差已修复并通过回归；允许发布。
- 附加要求：将“补测计划”并入下一轮测试基线，避免同类口径问题回归。
