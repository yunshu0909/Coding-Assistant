# TEST_PLAN（V0.16）- 模型配置与推理等级

## 1. 测试范围
- PRD：`/Users/wuhaoyang/Documents/trae_projects/skills/docs/prd/PRD-Skill-Manager-V0.16-模型配置与推理等级.md`
- 设计稿：
  - `/Users/wuhaoyang/Documents/trae_projects/skills/设计/v0.16-模型与推理/启动模式-设计稿.html`
  - `/Users/wuhaoyang/Documents/trae_projects/skills/设计/v0.16-模型与推理/模型与推理-全状态设计参考.html`
- 范围内：
  - 模型配置 Tab 读取链路：`model` + `effortLevel`（完整/部分/未配置/损坏）
  - 模型配置写入链路：预设模型、自定义模型、推理等级
  - 写入中防重：radio + 输入框 + 应用按钮统一禁用
  - 错误与恢复：读取失败重试、写入失败反馈、空输入拦截
  - Electron 真实链路：页面交互触发真实落盘
- 非范围：
  - 第三方供应商模型配置
  - `max` effort 持久化
  - 模型值合法性在线校验
  - 样式像素级视觉比对

## 2. 完成门槛
1. Backend 测试全部通过（P0 100%）
2. Frontend Integration 测试全部通过（P0 100%）
3. Electron E2E 主链路全部通过（P0 100%）
4. Happy / Error / Boundary / Regression 四路径均有自动化覆盖

## 3. 自动化边界（A/H/A+H）
- A（全自动）：
  - `get-model-config` 读取契约分支与错误码
  - `set-model-config` 参数校验、备份、原子写入、字段保留
  - 页面状态切换、写入防重、成功/失败反馈
  - Electron 环境中的真实文件落盘
- H（人工补测）：
  - 视觉一致性（双列布局、分隔线、排版）
  - 交互动效体感（Toast 动画、禁用态样式）
- A+H（联合）：
  - 错误文案可读性（技术细节与用户理解）

## 4. 分层测试编排（映射四路径）
- Backend（Vitest / Node）
  - 文件：`自动化测试/V0.16/tests/backend/modelConfigHandlers.v16.behavior.test.js`
  - Happy：正常读取、首次写入、预设字段更新
  - Error：JSON 损坏、非法 field/value、非法 effort
  - Boundary：部分配置、自定义模型值
  - Regression：写入 model/effort 不覆盖其他字段
- Integration（Vitest / jsdom）
  - 文件：`自动化测试/V0.16/tests/integration/PermissionModePage.v16.model-config-flow.test.jsx`
  - Happy：Tab 切换、预设模型切换、推理等级切换
  - Error：写入失败、读取失败重试、空输入
  - Boundary：自定义模型、回车提交、写入中防重
  - Regression：幂等点击不触发写入
- E2E（Playwright / Electron）
  - 文件：`自动化测试/V0.16/tests/e2e/model-config.v16.formal-electron.spec.js`
  - Happy：未配置态切换并落盘
  - Error：损坏配置重试恢复
  - Boundary：自定义模型落盘 + 预设取消高亮
  - Regression：保留非目标字段

## 5. 执行顺序
1. `npm run test:v16:backend`
2. `npm run test:v16:integration`
3. `npm run test:e2e:v16`
4. `npm run test:v16:all`

## 6. 输出产物
- `TEST_CASES.md`
- `TEST_REPORT.md`
- `DECISION_LOG.md`
