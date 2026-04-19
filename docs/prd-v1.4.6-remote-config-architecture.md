# 产品需求文档：CodePal V1.4.6（远程配置一套架构 + Claude 4.7 对齐）

> 文档版本：v1.4.6-r1  
> 创建日期：2026-04-18  
> 对应版本：`v1.4.6`  
> 版本类型：`架构改造 + Claude 4.7 数据对齐`  
> 对应模块：`src/config/model-registry.json`、`src/config/pricing.json`、`electron/services/remoteConfigLoader.js`（新增）、`electron/services/registries/*`（新增）、`electron/handlers/modelConfigHandlers.js`、`src/pages/ModelConfigTab.jsx`、`src/store/costCalculator.js`

---

## 1. 背景与问题定义

当前暴露了三个独立痛点，但背后是**同一个架构问题**：

### 1.1 痛点

**痛点 1：Claude 4.7 的新推理档切不过去**  
Claude Code 2.1.114 引入了 `xhigh` 推理档，但 CodePal "启动模式"页面只有低/中/高三档，并且后端 `effortLevel` 白名单硬编码拒绝 `xhigh` 写入。

**痛点 2：Opus 4.7 费用显示 `--`**  
用量监测页面显示 Opus 4.7 累计 117M token，但预估费用是 `--`。根因是 `src/config/pricing.json` 里压根没有 `claude-opus-4-7` 这个 key，`costCalculator.js` 查不到就返回 null。

**痛点 3：数据变化强耦合发版节奏**  
每次 Anthropic 出新模型、调整推理档，或者 OpenAI / Kimi 更新定价，都必须等 CodePal 发新版 dmg，用户才能用上。但这些是**纯数据变化**，不是**代码逻辑变化**，却被打包节奏绑死了。

### 1.2 共同根因

模型元数据（models / pricing / 未来的 codex / kimi 配置）全部**硬编码或静态打包**在安装包里：

- `model-registry.json` 是静态 JSON 打包进 dmg
- `pricing.json` 同样是静态 JSON 打包进 dmg
- `costCalculator.js` 直接 `import pricingData from '../config/pricing.json'`
- 后端白名单 `VALID_EFFORT_LEVELS = ['low', 'medium', 'high']` 写死代码里

这让"数据层变化"和"代码层发版"被不必要地耦合。每次 Claude 升级都得发 CodePal 版本，成本远大于价值。

### 1.3 V1.4.5 的部分进展（已 commit，未发版）

V1.4.5 周期内已经合入了 model-registry 远程化的**第一版**（commit `35e3e6e`）：

- 新增 `src/config/model-registry.json` 作为模型元数据 registry
- 新增 `electron/services/modelRegistryService.js`
- 三层兜底 + jsDelivr/GitHub Raw 双源拉取
- 后端白名单改为正则格式校验，支持 xhigh
- 推理等级新增 xhigh（超高）档

但这批改动的架构**仅覆盖 model-registry 一个场景**，pricing 仍是静态打包，未来 codex / kimi 等也需要各自做一套，违反"一套逻辑"的产品诉求。

**本版 V1.4.6 的核心工作是把 model-registry 的能力泛化成通用 remote-config 框架，并迁移 pricing 进来，作为首批两个使用者。**

---

## 2. 根因验证结论

### 2.1 pricing.json 缺失 claude-opus-4-7

验证方式：`cat src/config/pricing.json | grep opus`  
实际结果：只有 `claude-opus-4-6`，没有 `claude-opus-4-7`  
Claude Code 日志里 Opus 4.7 被记为 `Claude Opus 4.7`，`normalizeModelKey` 规范化为 `claude-opus-4-7`，查不到 → 返回 null → UI 显示 `--`

### 2.2 pricing.json 静态打包

验证方式：`src/store/costCalculator.js:12` 直接 `import pricingData from '../config/pricing.json'`  
实际结果：pricing 数据在 Vite 打包阶段被编译进 bundle，运行时无法替换，更新必须重新构建

### 2.3 Claude 4.7 与 4.6 定价相同

验证方式：Claude Code 二进制 strings 中的官方定价表  
实际结果：
```
Claude Opus 4.7   | $5.00 input / $25.00 output / 1M context
Claude Opus 4.6   | $5.00 input / $25.00 output / 1M context（相同）
Claude Sonnet 4.6 | $3.00 input / $15.00 output / 1M context
Claude Haiku 4.5  | $1.00 input / $5.00 output / 200K context
```

结论：补 Opus 4.7 数据可直接复用 4.6 的定价数字，无需重新查表。

### 2.4 Claude Code 别名实际清单

验证方式：`strings claude-darwin-arm64 | grep -E "^(opus|sonnet|haiku)"`  
实际结果：`default / opus / opus[1m] / sonnet / sonnet[1m] / haiku` 共 6 个  
其中 `opus` 与 `opus[1m]`、`sonnet` 与 `sonnet[1m]` 在 Claude 4.7 后实质等价（默认都是 1M，取消长上下文溢价），历史遗留别名保留为了兼容老配置。

---

## 3. 本版目标

### 目标 1：抽象出通用 remote-config 框架

新增 `electron/services/remoteConfigLoader.js`，把"三层兜底 + 双源拉取 + 后台刷新"做成 registry 无关的纯机制。加新 registry 只需写 `{name, remotePath, cacheFile, packaged, hardcoded, validate}` 几十行即可。

### 目标 2：model-registry 迁移到新框架

把 V1.4.5 的 `modelRegistryService.js` 拆成"机制部分（去 loader）+ 配置部分（留在 modelRegistry）"。对外 IPC 行为、缓存文件路径保持不变，用户无感知。

### 目标 3：pricing 接入新框架

新增 `pricingRegistry`，pricing.json 走和 model-registry 同款的分发链路，不发版即可更新定价。

### 目标 4：补齐 Claude 4.7 相关的数据差距

- `pricing.json` 新增 `claude-opus-4-7` 条目（复用 4.6 定价）
- `pricing.json` 检查并补齐 `claude-haiku-4-5-20251001`（带日期后缀版，与 Claude Code 实际日志 id 对齐）
- `model-registry.json` 版本号推进到 `2026-04-18.1`（对应模型列表精简为 3 选项）

### 目标 5：国内用户不翻车

所有 registry 的**本地兜底必须永远可用**。远程拉失败仅影响数据滞后，不影响应用运行。

### 目标 6：costCalculator 支持动态 pricing

保留 `import pricingData` 作为渲染层兜底，新增 `setPricingOverride(data)` 覆盖机制，应用启动后异步从 IPC 拉取 pricing 并覆盖，不改 `calculateCosts` 的同步调用签名。

---

## 4. 非目标

以下内容不属于 V1.4.6 范围：

- **ETag / If-None-Match 增量判断**：每次启动无条件拉一次，简单优先（几百字节成本极低）
- **cache TTL 机制**：远程有就覆盖 cache，不做时间窗过期
- **纯远程配置（无本地兜底）**：拒绝任何可能让国内用户因网络问题无法启动的方案
- **第三方 UGC 配置**：比如社区贡献 pricing 维护，属于未来话题
- **Usage 聚合链路改造**：V1.4.2 已做过，不在本版范围
- **Claude API 直连改造**：本版仍通过 Claude Code CLI 间接接入
- **用户自定义 registry 来源**：即用户不能自己指定从哪个 URL 拉取 pricing

---

## 5. 用户交互方案

本版是架构改造版本，UI 变化极少。

### 5.1 启动模式 → 模型配置与推理等级

**推理等级**（已在 V1.4.5 commit 中引入，本版正式随发）：
- 新增第四档 `超高`（xhigh），文案"Claude 4.7 新增，推理最充分，适合复杂架构与调试"

**默认模型列表**（已在 V1.4.5 commit 中引入，本版正式随发）：
- 从 5 选项精简为 3 选项：
  - `opus[1m]` → Opus 4.7（最强 · 1M）
  - `sonnet[1m]` → Sonnet 4.6（日常 · 1M）
  - `haiku` → Haiku 4.5（快速 · 200K）
- 原无后缀的 `opus` / `sonnet` 别名实质等价于 `[1m]` 变体，不再暴露。老配置仍兼容（Claude Code 底层仍支持这些别名，用户可通过自定义输入框继续写入）。

### 5.2 用量监测

- Opus 4.7 的"预估费用"列由原本的 `--` 变为具体金额（例：$X.XX）
- 其余模型费用显示不变

### 5.3 不变的体验

- 启动速度不变（remote refresh 异步不阻塞）
- 离线可用性不变（本地兜底保证）
- 设置项位置、操作流程均不变

---

## 6. 技术方案

### 6.1 新增 electron/services/remoteConfigLoader.js（通用机制）

对外导出：

```
initRemoteConfig(spec, { getUserDataPath }) 
  → Promise<{source: 'cache'|'packaged'|'hardcoded', version: string}>

getRemoteConfig(name) 
  → {config: object, source: string}

refreshRemoteConfigInBackground(spec, { getUserDataPath }) 
  → Promise<{success: boolean, source?: string, error?: string}>
```

内部实现：

- **三层加载**：cache > packaged > hardcoded（按顺序尝试，每层失败回落）
- **双源拉取**：`REMOTE_SOURCE_TEMPLATES`（常量）= jsDelivr + GitHub Raw，URL 通过 `spec.remotePath` 拼接
- **超时**：每源 5 秒超时 (AbortController)
- **schema 校验**：调用 `spec.validate(data)`
- **cache 位置**：`<userData>/<spec.cacheFileName>`

state 管理：

- 模块级 `Map<name, {config, source}>` 持有每个 registry 的当前快照
- `initRemoteConfig` 注册快照
- `getRemoteConfig(name)` 同步读取
- `refreshRemoteConfigInBackground` 不更新内存快照，只写 cache（下次启动生效）

### 6.2 registry spec 规范

每个 registry 定义文件（位于 `electron/services/registries/<name>.js`）导出一个 spec 对象：

```
{
  name:              'pricing',              // 唯一标识
  remotePath:        'src/config/pricing.json',  // 相对 repo 根的路径
  cacheFileName:     'pricing.cache.json',
  packagedRequirePath: '../../../src/config/pricing.json',
  hardcoded:         HARDCODED_PRICING_FALLBACK,  // 最终兜底
  validate:          (data) => ({valid: boolean, error?: string}),
}
```

### 6.3 model-registry 迁移

- 删除：`electron/services/modelRegistryService.js` 中除 schema validate 和 hardcoded fallback 外的代码
- 新增：`electron/services/registries/modelRegistry.js` 导出 spec
- 改造：`electron/handlers/registerModelRegistryHandlers.js` 改为从 loader 读取
- 外部契约不变：IPC channel 仍是 `model-registry:get`，返回结构不变

### 6.4 pricing 接入

- 新增：`electron/services/registries/pricingRegistry.js` 导出 spec + HARDCODED_PRICING_FALLBACK
- 新增：`electron/handlers/registerPricingRegistryHandlers.js` 暴露 `pricing-registry:get`
- `electron/main.js` 启动流程接入两个 registry 的 init + 延迟后台刷新
- `electron/preload.js` 暴露 `getPricingRegistry`

### 6.5 pricing.json 数据补齐

```
新增条目:
  "claude-opus-4-7"       {input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25}
  "claude-haiku-4-5-20251001" {input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25}

新增顶层字段:
  "version": "2026-04-18"
  "updatedAt": "2026-04-18"
```

### 6.6 costCalculator.js 改造

```
保留: import pricingData from '../config/pricing.json'
新增: let activePricing = pricingData
新增: export function setPricingOverride(remote) { if (valid) activePricing = remote }
改造: calculateCosts 内部用 activePricing 代替 pricingData
```

App 启动时在 `src/App.jsx` 或根 hook 中调用：

```
useEffect(() => {
  window.electronAPI.getPricingRegistry()
    .then(r => r?.success && setPricingOverride(r.registry))
    .catch(() => {})
}, [])
```

### 6.7 命名与目录规范

```
electron/services/
├── remoteConfigLoader.js           ← 通用机制（新增）
├── modelRegistryService.js         ← 删除或清空
└── registries/                     ← 新增目录
    ├── modelRegistry.js            ← 迁移 spec 过来
    └── pricingRegistry.js          ← 新增 spec

electron/handlers/
├── registerModelRegistryHandlers.js ← 瘦身，只做 IPC 路由
└── registerPricingRegistryHandlers.js ← 新增
```

---

## 7. 关键实现规则

### 7.1 loader 必须是纯机制

- 不得包含任何特定 registry 的业务逻辑
- 不得在 loader 内部判断 `name === 'pricing'` 之类
- 不得直接 import 任何 registry 数据

### 7.2 失败隔离（关键）

- **一个 registry 拉取失败不影响其他 registry**
- **一个 registry 的 cache 损坏不影响其他 registry 的加载**
- **一个 registry 的 schema 校验失败自动回落到打包版，不抛给上层**

### 7.3 同步加载路径必须快

- `initRemoteConfig` 同步加载路径（cache → packaged → hardcoded）必须在 100ms 内完成
- IO 错误不得抛出，静默回落到下一层

### 7.4 远程刷新不阻塞启动、不跳变 UI

- `createWindow()` 后立即返回，不等 refresh 完成
- 延迟 2 秒后才启动后台刷新
- refresh 成功仅写 cache，不更新内存 `getRemoteConfig` 返回的快照（避免 UI 中途变化）
- 下次启动时从 cache 读取到新数据，UI 才切换

### 7.5 registry spec 集中管理

- 所有 spec 定义必须放在 `electron/services/registries/` 下
- 以后加 codex / kimi 都遵循此位置，便于 code review

### 7.6 hardcoded fallback 必须通过自身 schema 校验

- 每个 registry 的 `HARDCODED_FALLBACK` 必须能通过自己的 `validate` 函数
- 单测必须覆盖此约束（防止兜底数据本身坏掉）

### 7.7 cache 写入必须原子

- 先写临时文件再 rename（沿用 V1.4.5 做法）
- cache 写失败不影响当前会话运行

---

## 8. 验收标准

### AC-01：推理等级支持 xhigh

- 启动模式 Tab → 模型配置，推理等级区域有 4 档：低 / 中 / 高 / 超高
- 点击"超高"成功写入 `~/.claude/settings.json` 的 `effortLevel: "xhigh"`
- toast 提示"已切换推理等级为「超高」"

### AC-02：模型列表精简

- 默认模型区域只显示 3 个预设：Opus 4.7 / Sonnet 4.6 / Haiku 4.5
- 状态卡显示对应 display 名称（如"Opus 4.7"而非"opus[1m]"）
- 老用户 settings.json 里若已写 `opus`（无后缀），状态卡正确 fallback 显示 id

### AC-03：Opus 4.7 费用能算出

- 用量监测 → 今日/近7天/近30天/累计至今，任意有 Opus 4.7 消耗的周期
- Opus 4.7 行的"预估费用"列显示具体金额（非 `--`）
- 金额数值与手动按 $5/$25 per MTok 计算结果一致

### AC-04：通用 loader 存在且被复用

- `electron/services/remoteConfigLoader.js` 存在
- `modelRegistry.js` 和 `pricingRegistry.js` 都通过 loader 加载
- loader 本身不 import 任何 registry 数据

### AC-05：三层兜底都生效

- 场景 A：清空 userData 启动 → 主进程日志 `loaded from packaged`（两个 registry 都有）
- 场景 B：破坏 packaged JSON 启动 → `loaded from hardcoded`
- 场景 C：正常网络 + 曾经启动过 → `loaded from cache`

### AC-06：双源拉取都生效

- 用防火墙或 hosts 封禁 jsDelivr，日志应显示 `fetch failed from jsDelivr` 然后 `refreshed from GitHub Raw`
- 同时封禁两个源，日志显示 `refresh skipped: ALL_REMOTE_SOURCES_FAILED`，UI 仍正常

### AC-07：失败隔离

- 修改 `pricing.json` 加入语法错误（缺一个逗号），push
- 下次启动日志：pricing 拉取失败回退 packaged，但 model-registry 仍成功 refresh
- UI 上 model 列表正常，费用显示兜底数据

### AC-08：远程更新生效

- 改 `pricing.json` 把某个 Claude 模型 input 单价改为 6.00（原 5.00），push master
- 关闭 CodePal → 启动 → 日志显示 `[pricing] refreshed from ..., version=...`
- 关闭 CodePal → 再次启动 → 日志显示 `[pricing] loaded from cache`
- UI 上费用按 6.00 计算

### AC-09：单测覆盖

- V0.16 全量测试通过（当前 43 个，本版新增 pricingRegistry 单测 ≥16 个，目标 60+ 通过）
- `remoteConfigLoader.js` 有独立单测覆盖三层兜底、双源 fallback、schema 校验路径

### AC-10：工程验证

- `npm run build` 通过无 warning
- dev 模式启动 3 秒内 UI 可交互
- 主进程内存占用增量 < 2MB

---

## 9. 手工验证清单

### 场景 1：全新安装首次启动

1. 删除 `~/Library/Application Support/skill-manager/` 整个目录
2. `npm run dev`
3. 预期主进程日志两个 registry 都是 `loaded from packaged`
4. 验证 UI 正常（4 档推理、3 个模型）

### 场景 2：联网常规启动

1. 正常 dev 启动
2. 2 秒后应看到：
   - `[model-registry] refreshed from https://cdn.jsdelivr.net/...`
   - `[pricing] refreshed from https://cdn.jsdelivr.net/...`
3. `ls ~/Library/Application Support/skill-manager/*.cache.json` 能看到两个 cache 文件

### 场景 3：离线启动

1. 断网
2. 启动 CodePal
3. 预期两个 registry 都是 `loaded from cache`（如有 cache）或 `loaded from packaged`
4. 2 秒后 refresh 阶段应打印 `refresh skipped: ALL_REMOTE_SOURCES_FAILED`
5. UI 正常

### 场景 4：pricing 远程更新端到端

1. 改 `src/config/pricing.json` 里 `claude-opus-4-7.input` 从 5.00 改为 9.99
2. `git commit + push origin master`
3. 等 jsDelivr 同步（约 1-3 分钟）
4. 关闭 CodePal，重启 → 日志应有 pricing refresh 成功且 version 更新
5. 再次关闭重启 → 日志显示 `loaded from cache`
6. 用量监测里 Opus 4.7 费用按新单价计算
7. 验证完改回 5.00 再 push 一次

### 场景 5：失败隔离验证

1. 改 `pricing.json` 故意删掉一个关键字段让 schema 校验失败
2. push master
3. 启动 CodePal
4. 预期：pricing 拉取成功但 validate 失败，日志 `remote invalid`，cache 不更新
5. model-registry 应正常 refresh
6. UI 上 model 列表正常，费用显示 packaged 兜底
7. 验证完 revert pricing.json

### 场景 6：版本回归

1. 启动模式 / 模型配置 Tab 走一遍完整交互（选预设、切推理档、填自定义值、应用）
2. 用量监测 4 个 tab 各进一次，确认数字和费用都显示

---

## 10. 分批交付建议

V1.4.6 的改动较多，建议分两批 commit（均进入同一 tag）：

### 批次 A（已完成，待 tag）
V1.4.5 周期遗留的 model-registry 远程化第一版 + xhigh + 模型列表精简
- commit `35e3e6e`
- 本地与 dev 已端到端验证
- 所有测试通过

### 批次 B（本 PRD 工作）
- 抽 `remoteConfigLoader.js`
- 迁移 modelRegistry 到 loader
- 新增 pricingRegistry 和 loader
- 补齐 pricing.json 数据
- costCalculator setPricingOverride 改造
- 单测补充

两批一起打 tag `v1.4.6`，CI 构建 dmg 发 release。

---

## 11. 版本结论

V1.4.6 的主线不是"加一个功能"，而是**把数据维护节奏和代码发版节奏解耦**。

- 以前：Claude / GPT / Kimi 每次升级 → 发 CodePal 新版 → 用户装新 dmg → 用上新数据
- 以后：改 JSON → push master → 所有用户下次启动自动拿到新数据，CodePal 本身无需发版

**一套逻辑覆盖所有配置场景**。这是架构投资，短期成本是一次重构 + 两倍测试，长期收益是每次 Claude / AI 工具升级省掉一次发版。

未来新增 Codex / Kimi 专属配置时，每个只需 ~50 行 registry spec + 一份 JSON，不再重复机制代码。

Claude 4.7 对齐的紧急差距（xhigh 推理档、Opus 4.7 费用）一并在本版解决。
