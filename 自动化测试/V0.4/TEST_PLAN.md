# TEST_PLAN（V0.4 历史回归基线）

## 1. 测试范围
- PRD：
  - `/Users/wuhaoyang/Documents/trae_projects/skills/docs/prd/PRD-Skill-Manager-V0.1.md`
  - `/Users/wuhaoyang/Documents/trae_projects/skills/docs/prd/PRD-Skill-Manager-V0.2.md`
  - `/Users/wuhaoyang/Documents/trae_projects/skills/docs/prd/PRD-Skill-Manager-V0.3.md`
  - `/Users/wuhaoyang/Documents/trae_projects/skills/docs/prd/PRD-Skill-Manager-V0.4.md`
- 范围内：
  - 导入页基础流程（启动分流、来源选择、导入按钮状态）
  - 数据层导入/推送/停用/配置与增量导入规则
  - 管理页批量推送/停用与配置入口
  - 导入后首次进入推送目标初始化
- 非范围：
  - 用量监测真实数据能力（V0.5+）
  - UI 视觉质感与交互动效细节
  - 业务策略合理性与产品取舍判断（人工评审）

## 2. 完成门槛
1. 计划内用例：`17/17` 通过
2. P0 用例通过率：`100%`
3. Unit / Integration / E2E 顺序执行通过
4. 无阻断/严重缺陷遗留

## 3. 用例清单
### Unit（8）
- `UT-01`：`getPushTargets` 空配置回退全部预设工具（A）
- `UT-02`：`initPushTargetsAfterImport` 有预设工具时仅保留预设（A）
- `UT-03`：`initPushTargetsAfterImport` 仅自定义来源时回退全部预设（A）
- `UT-04`：`importSkills` 强制覆盖复制 + 首次进入标记（A）
- `UT-05`：`unpushSkills` 对 `SOURCE_NOT_FOUND` 静默成功（A）
- `UT-06`：`incrementalImport` 仅新增不覆盖，已存在项跳过（A）
- `UT-07`：`pushSkills` 中央仓库缺失时失败返回（A）
- `UT-08`：`saveImportSources` 非数组参数校验（A）

### Integration（6）
- `IT-01`：中央仓库有数据时启动进入 workbench（A）
- `IT-02`：中央仓库无数据时进入导入页并在导入后切回 workbench（A）
- `IT-03`：导入后首次进入触发推送目标初始化 + 清标记（A）
- `IT-04`：管理页批量推送仅处理未推送项（A）
- `IT-05`：管理页批量停用仅处理已推送项（A）
- `IT-06`：管理页配置入口回调触发（A）

### E2E（3）
- `E2E-01`：首屏渲染可用（导入页或工作台）（A）
- `E2E-02`：导入页/管理页关键入口可交互（A+H）
- `E2E-03`：历史主路径基础元素稳定可见（A+H）

## 4. 执行顺序
1. Unit：`npm run test:v04`
2. Integration：`npm run test:v04`（同批执行）
3. E2E：`npm run test:e2e:v04`
4. 自动修复循环（最多 3 轮）：`执行 -> 定位 -> 修复 -> 重跑`

## 5. 输出产物
- `自动化测试/V0.4/TEST_REPORT.md`
- 命令执行结果摘要（Unit / Integration / E2E）
