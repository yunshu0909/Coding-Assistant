# TEST_CASES（V0.16）- 模型配置与推理等级

## 1. 文档目标
- 目标：对 V0.16 模型配置与推理等级提供“后端 + 前端 + Electron”闭环自动化验证。
- 依据 PRD：`/Users/wuhaoyang/Documents/trae_projects/skills/docs/prd/PRD-Skill-Manager-V0.16-模型配置与推理等级.md`
- 依据 UI：
  - `/Users/wuhaoyang/Documents/trae_projects/skills/设计/v0.16-模型与推理/启动模式-设计稿.html`
  - `/Users/wuhaoyang/Documents/trae_projects/skills/设计/v0.16-模型与推理/模型与推理-全状态设计参考.html`

## 2. 阶段一：后端读写契约（BE）

### TC-BE-01（P0）settings.json 不存在时返回未配置
- 类型：Backend Unit
- 覆盖：`get-model-config`
- 断言：
  - `success=true`
  - `model=null`
  - `effortLevel=null`
  - `isModelConfigured=false`
  - `isEffortConfigured=false`

### TC-BE-02（P0）完整配置读取成功
- 类型：Backend Unit
- 覆盖：`get-model-config`
- 前置：`model=opus[1m]`、`effortLevel=high`
- 断言：
  - `success=true`
  - 两字段与配置一致

### TC-BE-03（P0）部分配置独立判断
- 类型：Backend Unit
- 覆盖：`get-model-config`
- 前置：仅 `model=sonnet`
- 断言：
  - `isModelConfigured=true`
  - `isEffortConfigured=false`

### TC-BE-04（P0）JSON 损坏返回解析错误
- 类型：Backend Unit
- 覆盖：`get-model-config`
- 前置：`settings.json` 非法 JSON
- 断言：
  - `success=false`
  - `errorCode=JSON_PARSE_ERROR`

### TC-BE-05（P0）非法 field 写入被拦截
- 类型：Backend Unit
- 覆盖：`set-model-config`
- 输入：`field=unknownField`
- 断言：
  - `success=false`
  - `errorCode=INVALID_FIELD`

### TC-BE-06（P0）空 value 写入被拦截
- 类型：Backend Unit
- 覆盖：`set-model-config`
- 输入：`value="  "`
- 断言：
  - `success=false`
  - `errorCode=INVALID_VALUE`

### TC-BE-07（P0）非法 effort 等级被拦截
- 类型：Backend Unit
- 覆盖：`set-model-config`
- 输入：`field=effortLevel`、`value=max`
- 断言：
  - `success=false`
  - `errorCode=INVALID_EFFORT_LEVEL`

### TC-BE-08（P0）首次写入 model 应创建 settings.json
- 类型：Backend Integration
- 覆盖：`set-model-config`
- 前置：文件不存在
- 断言：
  - `success=true`
  - 文件创建成功
  - `model` 为目标值

### TC-BE-09（P0）写入 effortLevel 保留其他字段并生成备份
- 类型：Backend Integration
- 覆盖：`set-model-config`
- 前置：原文件包含 `model`、`permissions`、扩展字段
- 断言：
  - `success=true`
  - 返回 `backupPath`
  - 非目标字段保持不变

### TC-BE-10（P0）写入 model 不覆盖 effortLevel（回归）
- 类型：Backend Integration
- 覆盖：`set-model-config`
- 前置：已有 `effortLevel=high`
- 断言：
  - `model` 更新
  - `effortLevel` 保持 `high`

### TC-BE-11（P1）原文件损坏时自动恢复并完成写入
- 类型：Backend Integration
- 覆盖：`set-model-config`
- 前置：原文件为损坏 JSON
- 断言：
  - `success=true`
  - 新文件可解析
  - 目标字段写入成功

### TC-BE-12（P0）IPC 参数非字符串应返回参数错误
- 类型：Backend Unit
- 覆盖：`set-model-config` IPC 包装
- 输入：`value=123`
- 断言：
  - `success=false`
  - `errorCode=INVALID_ARGUMENT`

## 3. 阶段二：页面状态与交互（FE Integration）

### TC-FE-01（P0）已配置态显示状态卡并高亮选中项
- 类型：Frontend Integration
- 覆盖：正常读取
- 断言：
  - 状态卡展示模型显示名与推理等级
  - 对应模型/推理等级 radio 高亮

### TC-FE-02（P0）部分配置独立展示未显式配置文案
- 类型：Frontend Integration
- 覆盖：部分配置
- 断言：
  - 已配置字段正常高亮
  - 未配置字段显示“未显式配置”副文本

### TC-FE-03（P0）自定义模型值不匹配预设时无高亮
- 类型：Frontend Integration
- 覆盖：Boundary
- 断言：
  - 状态卡显示原始模型值
  - 7 个预设 radio 均无高亮

### TC-FE-04（P0）选择预设模型成功触发写入
- 类型：Frontend Integration
- 覆盖：Happy
- 断言：
  - 调用 `setModelConfig('model', target)`
  - 成功 Toast 可见
  - 高亮更新

### TC-FE-05（P0）空自定义输入拦截并提示错误
- 类型：Frontend Integration
- 覆盖：Error
- 断言：
  - Toast「请输入模型标识」
  - 不触发写入调用

### TC-FE-06（P0）回车提交等同点击应用
- 类型：Frontend Integration
- 覆盖：Boundary
- 断言：
  - 回车触发 `setModelConfig('model', value)`
  - 状态卡更新为原始输入值

### TC-FE-07（P0）推理等级切换成功更新高亮
- 类型：Frontend Integration
- 覆盖：Happy
- 断言：
  - 调用 `setModelConfig('effortLevel', target)`
  - 成功 Toast 可见
  - 推理等级高亮切换

### TC-FE-08（P0）写入中全局禁用防重
- 类型：Frontend Integration
- 覆盖：Boundary + Regression
- 断言：
  - 模型与推理等级 radio 均进入禁用态
  - 输入框与应用按钮 disabled

### TC-FE-09（P0）写入失败应保持原值并提示错误
- 类型：Frontend Integration
- 覆盖：Error
- 断言：
  - 错误 Toast 可见
  - 当前高亮保持原值

### TC-FE-10（P0）读取失败态重试后恢复
- 类型：Frontend Integration
- 覆盖：Error
- 断言：
  - 首次进入错误态
  - 点击重试后二次读取成功

### TC-FE-11（P0）幂等点击当前项不触发写入
- 类型：Frontend Integration
- 覆盖：Regression
- 断言：
  - 点击当前模型和当前推理等级不调用 `setModelConfig`

## 4. 阶段三：Electron 全链路（E2E）

### TC-E2E-01（P0）未配置态切换模型和推理等级并落盘
- 类型：E2E
- 断言：
  - 初始显示 Default + 中
  - 切换 sonnet 与 high 后出现成功提示
  - `~/.claude/settings.json` 写入 `model=sonnet`、`effortLevel=high`

### TC-E2E-02（P0）应用自定义模型后状态卡显示原值且预设不高亮
- 类型：E2E
- 断言：
  - 成功 Toast 可见
  - 状态卡显示 `claude-opus-4-6`
  - 预设 radio 无高亮
  - 非目标字段保持不变

### TC-E2E-03（P0）JSON 解析错误可通过重试恢复
- 类型：E2E
- 断言：
  - 首次进入错误态
  - 修复文件后点击“重试”恢复正常
