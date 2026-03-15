# CodePal — AI 编程的幕后助手

AI 编程工具负责写代码，CodePal 负责写代码之外的一切——Skills 调度、成本监控、环境配置、工作流管理，跨 Claude Code / CodeX / Cursor / Trae 统一搞定。

---

## 为什么需要 CodePal？

你用 AI 写代码，但写代码只是冰山一角。你还需要：

- 几十个 Skills 在多个工具之间同步推送，改一处全局生效
- 知道这个月 Token 花了多少，哪个模型最费钱
- 在多个 API 供应商之间切换，管理 Key 和配置
- 新项目一键起步，不用每次手动建 CLAUDE.md、.gitignore

这些事没有一个 AI 编程工具会帮你做——Claude Code 不会帮你管 CodeX，CodeX 不会帮你管 Cursor。**CodePal 做的就是它们之间的连接层。**

---

## 功能一览

### 跨工具管理

**Skills 管理 — 写一次，到处用**

从任意工具导入技能到中央仓库，一键推送到所有工具，改一处自动同步。

- 从 Claude Code / CodeX / Cursor / Trae 扫描并导入，支持自定义路径和团队共享目录
- 一键批量推送或停用到多个工具，支持搜索和标签筛选
- 中央仓库与工具目录自动同步，改一处全局生效

**MCP 服务管理 — 可视化管理，不用手动编辑 JSON**

- 按工具查看和管理 MCP 服务的启用/停用状态

**用量监测 — Token 花了多少，一目了然**

自动聚合多个工具的使用数据，按日/周/月统计，模型分布和成本趋势直接看图。

- 按日/周/月统计 Token 用量，查看模型分布，辅助成本分析

**API 供应商配置 — 多供应商统一管理**

- 在 Claude Official / Kimi / AICodeMirror 等供应商之间一键切换，保存 API Key

### 工作流与效率

**项目初始化 — 新项目，一键起步**

- 选好模板，一键生成标准项目结构（CLAUDE.md、.gitignore 等），可选 Git 初始化

**启动模式与模型配置**

- 一键切换 4 种权限模式（只读规划 / 每次询问 / 自动编辑 / 全自动）
- 配置默认模型和推理等级，免去每次新会话手动调整

**Claude Code 健康检查**

- 查看版本、一键更新、Doctor 健康检查、认证状态、网络诊断

---

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发环境
npm run dev
```

`npm run dev` 会同时启动 Vite 开发服务器和 Electron 主进程。

### 环境要求

- Node.js 18+（建议 20 LTS）
- npm 9+
- macOS / Linux

---

## 技术栈

- **Electron** ^40.2.1
- **React** ^19.2.4
- **Vite** ^7.3.1

## 项目结构

```
skill-manager/
├── electron/                  # 主进程
│   ├── main.js                # 入口 + IPC 注册
│   ├── preload.js             # IPC bridge
│   ├── handlers/              # 按模块拆分的 IPC 处理器
│   └── services/              # 可复用业务逻辑
├── src/                       # 渲染进程
│   ├── App.jsx                # 根组件 + 路由
│   ├── pages/                 # 页面组件
│   ├── components/            # 通用组件库
│   └── styles/                # 样式文件
└── 自动化测试/                 # 分版本测试用例
```

## 构建

```bash
npm run build
```

构建产物在 `dist/`。当前未配置 `electron-builder`，不会直接产出安装包。

## License

ISC
