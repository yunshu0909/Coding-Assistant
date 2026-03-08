# Skill Manager 代码规范

本文档为 Claude Code 操作 skill-manager 目录下代码时的技术指引。

## 注释规范

### 必须写注释的地方

| 位置 | 格式 | 要求 |
|------|------|------|
| 文件顶部 | `/** */` | 模块名称 + 职责描述（bullet points）+ `@module` |
| 导出函数 | `/** */` | 功能描述 + `@param` + `@returns`，复杂函数加执行步骤 |
| 复杂逻辑 | `//` | 说明"为什么"，而非"做什么" |
| React useState | `//` | 每个 state 的用途 |

### 注释力度

**文件头示例**：
```javascript
/**
 * 数据存储模块
 *
 * 负责：
 * - 扫描工具目录获取技能
 * - 中央仓库的导入/导出
 * - 推送状态管理
 *
 * @module store/data
 */
```

**函数示例**：
```javascript
/**
 * 从工具导入技能到中央仓库
 * @param {string[]} toolIds - 工具 ID 列表
 * @returns {Promise<{success: boolean, copiedCount: number}>}
 */
async importSkills(toolIds) {
  // 1. 确保目录存在
  // 2. 扫描并复制技能
  // 3. 更新配置
}
```

**行内示例**：
```javascript
// 静默处理：用户可能手动删除了文件
if (error === 'SOURCE_NOT_FOUND') {
  count++ // 已删除视为成功
}
```

### 不写废话

❌ `// 设置 x 为 1` `// 遍历数组` `// 如果成功`

✅ `// 统计成功导入的技能数` `// 倒序遍历避免索引错乱` `// 部分成功也算成功`

---

## 项目概况

**Skill Manager** - Electron 桌面应用，管理 AI 编程技能并分发到 Claude Code、CodeX、Cursor 等工具。

### 技术栈
- Electron (v40.2.1) + React (v19.2.4) + Vite (v7.3.1)

### 目录结构
```
skill-manager/
├── electron/
│   ├── main.js          # 主进程：IPC、文件操作
│   └── preload.js       # 预加载脚本
├── src/
│   ├── App.jsx          # 根组件
│   ├── pages/           # ImportPage, ManagePage, McpPage, ApiConfigPage,
│   │                    # PermissionModePage, ProjectInitPage, UsageMonitorPage ...
│   ├── components/
│   │   ├── Button/Button.jsx       # 通用按钮
│   │   ├── Tag/Tag.jsx             # 状态标签
│   │   ├── SearchInput/SearchInput.jsx  # 搜索框
│   │   ├── StateView/StateView.jsx # 加载/错误/空态统一视图
│   │   ├── Modal/Modal.jsx         # 弹窗底座
│   │   ├── PageShell.jsx           # 页面容器（白卡 + 标题区）
│   │   ├── Toast.jsx               # 轻提示
│   │   ├── Toggle.jsx              # 开关
│   │   └── Checkbox.jsx            # 复选框
│   ├── hooks/
│   │   └── useAsyncData.js         # 异步数据加载 hook
│   └── store/           # data.js, fs.js, services/
└── vite.config.js
```

### 开发命令
```bash
npm run dev      # 启动开发环境
npm run build    # 生产构建
npm run preview  # 预览生产构建
```

### 核心概念
- **中央仓库**: `~/Documents/SkillManager/`
- **工具目录**: `~/.claude/skills/`、`~/.codex/skills/`、`~/.cursor/skills/`
- **技能**: 包含 `SKILL.md` 的文件夹
- **IPC**: 渲染进程通过 `window.electronAPI` 调用主进程

---

## 组件库规范

项目已有完整组件库，**写新 UI 时必须优先使用现有组件，禁止自己写 className + 内联样式来实现相同效果。**

### 可用组件速查

| 组件 | 路径 | 用途 |
|------|------|------|
| `<Button>` | `components/Button/Button.jsx` | 所有按钮。variant: `primary` / `secondary` / `danger` / `ghost`；支持 `loading`、`disabled`、`size="sm"`<br>`primary`=主操作 `secondary`=有边框次级操作 `ghost`=无边框低调操作 `danger`=危险操作 |
| `<Tag>` | `components/Tag/Tag.jsx` | 状态标签。variant: `success` / `info` / `warning` / `default` |
| `<SearchInput>` | `components/SearchInput/SearchInput.jsx` | 带图标的搜索输入框，支持 `disabled` |
| `<StateView>` | `components/StateView/StateView.jsx` | 加载/错误/空态统一视图，包裹业务内容 |
| `<Modal>` | `components/Modal/Modal.jsx` | 弹窗底座，处理遮罩/ESC/滚动锁定 |
| `<PageShell>` | `components/PageShell.jsx` | 页面容器（见下节） |
| `useAsyncData` | `hooks/useAsyncData.js` | 封装异步加载的三态 state |

### 禁止事项

- ❌ 自己写 `<button className="btn-primary">` —— 用 `<Button variant="primary">`
- ❌ 自己写 `isLoading ? <div>加载中...</div> : error ? <div>出错</div> : ...` —— 用 `<StateView>`
- ❌ 自己写 `<div className="modal-overlay">` 遮罩 —— 用 `<Modal>`
- ❌ 为新组件/页面创建专属的 `.btn-xxx`、`.tag-xxx` CSS 类 —— 用现有组件的 variant

### StateView 用法示意

```jsx
<StateView
  loading={isLoading}
  error={error?.message}
  onRetry={handleRetry}
  empty={list.length === 0}
  emptyMessage="暂无数据"
>
  {/* 正常内容，只在非 loading/error/empty 时渲染 */}
  {list.map(...)}
</StateView>
```

### Modal 用法示意

```jsx
<Modal
  open={isOpen}
  onClose={handleClose}
  title="标题"
  footer={
    <>
      <Button variant="secondary" onClick={handleClose}>取消</Button>
      <Button variant="primary" onClick={handleSave}>保存</Button>
    </>
  }
>
  {/* 弹窗正文内容 */}
</Modal>
```

---

## 页面开发规范

新建页面必须使用 `<PageShell>` 作为外层容器，不允许自行实现白卡、标题区或外层 padding。

### 基本用法

```jsx
import PageShell from '../components/PageShell'

export default function MyPage() {
  return (
    <PageShell title="页面标题" subtitle="一句话描述">
      {/* 业务内容 */}
    </PageShell>
  )
}
```

### Props 速查

| Prop | 类型 | 默认值 | 用途 |
|------|------|--------|------|
| `title` | string | — | 页面标题（必填） |
| `subtitle` | string | — | 副标题 |
| `actions` | ReactNode | — | 标题右侧操作区（如按钮） |
| `divider` | boolean | false | 标题区底部加分隔线 |
| `className` | string | — | 传入变体类 |

### 变体选择

| 场景 | 用法 |
|------|------|
| 普通内容页（滚动由外层控制） | 默认，无需额外 className |
| 内部有独立滚动区域（表格、双栏等） | `className="page-shell--no-padding"` |
| 标题与内容需要视觉分隔 | `divider` prop |
| 标题右侧有操作按钮 | `actions={<button>...</button>}` |

### 参考实现

- 组件：`skill-manager/src/components/PageShell.jsx`
- 样式：`skill-manager/src/components/PageShell.css`
- 典型用例：`ManagePage.jsx`（actions + no-padding）、`McpPage.jsx`（divider + no-padding）

---

## 设计任务读取规则

- 当任务涉及 UI/视觉设计（如页面改版、组件样式、布局规范、设计稿还原）时，先读取：`/Users/wuhaoyang/Documents/trae_projects/skills/设计/design-system.html`
- 当任务不涉及 UI/设计（如业务逻辑、接口、构建、脚本、测试、文档）时，不需要读取该设计规范文件
- 读取时优先按需定位相关章节，避免无关内容占用上下文

---

## 文件体量与架构通用规范

### 1) 文件体量红线（强制）

> 目标：避免超大文件导致维护成本失控。
> 说明：这里不再区分"建议上限"，只保留必须执行的红线。

| 维度 | 红线 | 触发动作 |
|------|------|----------|
| JS/JSX/TS/TSX 单文件 | 800 行 | 超线后禁止继续叠加功能，必须拆分 |
| React 页面组件文件 | 650 行 | 超线后优先抽离 hooks/子组件，再继续迭代 |
| 单个函数 | 120 行 | 必须拆步骤，拆为多个函数 |
| 单组件 `useState` 数 | 12 个 | 必须重构状态结构（`useReducer`/自定义 hook） |
| 单文件 IPC handler 数 | 15 个 | 禁止新增 handler 到该文件，必须按领域拆分 |

### 2) 拆分触发条件（强制）

- 任一维度超过红线：立即进入拆分，不得以"需求紧急"为由继续堆叠。
- 一个文件同时承担 3 类及以上职责（如页面渲染 + 状态管理 + 文件操作）：视为职责混杂，必须拆分。
- 新需求若需要在同一文件修改 3 个及以上不相邻区域：默认触发拆分评估。
- 同类逻辑重复出现第 2 次（如路径处理、错误映射、配置读写）：必须抽公共函数。

### 3) 分层边界规则

- 入口层：只做启动、初始化、注册，不承载业务细节。
- IPC 层：只做参数校验、调用服务、返回统一结果，不直接堆复杂业务流程。
- 服务层：承载可复用业务逻辑，避免依赖 UI 细节，优先可测试。
- 页面层：负责状态编排与渲染，不直接实现重型业务逻辑。
- 状态/数据层：负责数据获取、转换、缓存与状态同步，对页面提供稳定接口。

### 4) 超限文件增量治理

- 已超红线文件：只允许修复类改动和拆分改动，不允许新增功能。
- 新功能默认落在新模块，避免继续放大旧文件。
- 拆分顺序必须为：先保证行为不变，再做结构拆分，最后做逻辑优化。
- 代码评审必须检查"是否向超限文件继续堆逻辑"，作为必审项。

### 5) 统计口径（避免误判）

- 红线检查默认针对主线生产代码：`skill-manager/src/`、`skill-manager/electron/`。
- 构建产物与第三方依赖不纳入统计（如 `dist/`、`node_modules/`、`tests/report/assets/`）。
- 测试与历史归档目录可做参考统计，但不作为阻塞门禁；是否门禁由当前迭代目标决定。
