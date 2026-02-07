# Proposal: 初始化 Electron + React 项目

## 1. 背景 (Background)

我们需要为「AI 对账助手」构建一个基于 Electron 的桌面应用程序。该应用需要支持跨平台运行（Windows、macOS、Linux），并提供现代化的用户界面和流畅的用户体验。

## 2. 目标 (Goals)

- ✅ 使用 `electron-vite` 初始化项目，集成 Electron + Vite + React + TypeScript
- ✅ 配置 Ant Design 作为 UI 组件库
- ✅ 配置 Tailwind CSS 作为样式方案
- ✅ 设置 React Router 进行页面路由管理
- ✅ 配置 Zustand 进行状态管理
- ✅ 建立标准的项目目录结构
- ✅ 配置 ESLint + Prettier 代码规范
- ✅ 配置 electron-builder 打包方案

## 3. 非目标 (Non-Goals)

- ❌ 本阶段不实现具体的业务功能
- ❌ 本阶段不集成后端 API
- ❌ 本阶段不配置 CI/CD 流水线
- ❌ 本阶段不接入数据库

## 4. 技术方案 (Technical Approach)

### 4.1 项目脚手架

使用 `electron-vite` 官方脚手架创建项目：

```bash
npm create @anthropic/electron-vite@latest . -- --template react-ts
```

### 4.2 依赖安装

**生产依赖：**
- `antd` - Ant Design UI 组件库
- `react-router-dom` - React 路由
- `zustand` - 状态管理
- `lucide-react` - 图标库

**开发依赖：**
- `tailwindcss` / `postcss` / `autoprefixer` - Tailwind CSS
- `eslint` / `prettier` - 代码规范
- `electron-builder` - 应用打包

### 4.3 项目结构

```
electron-bank/
├── electron/                   # Electron 主进程
│   ├── main.ts                # 主进程入口
│   └── preload.ts             # 预加载脚本
├── src/                       # 渲染进程（React）
│   ├── assets/                # 静态资源
│   ├── components/            # 通用组件
│   │   └── Layout/            # 布局组件
│   ├── pages/                 # 页面组件
│   │   └── Home/              # 首页
│   ├── stores/                # Zustand stores
│   ├── hooks/                 # 自定义 Hooks
│   ├── utils/                 # 工具函数
│   ├── types/                 # 类型定义
│   ├── styles/                # 全局样式
│   │   └── index.css          # Tailwind 入口
│   ├── router/                # 路由配置
│   │   └── index.tsx
│   ├── App.tsx                # 根组件
│   └── main.tsx               # 渲染进程入口
├── openspec/                  # 项目规范
├── electron-builder.yml       # 打包配置
├── electron.vite.config.ts    # Vite 配置
├── tailwind.config.js         # Tailwind 配置
├── postcss.config.js          # PostCSS 配置
├── tsconfig.json              # TypeScript 配置
└── package.json
```

## 5. 验收标准 (Acceptance Criteria)

1. **项目可启动**：运行 `npm run dev` 能够成功启动 Electron 应用
2. **页面可访问**：应用窗口显示一个带有基础布局的首页
3. **UI 正常渲染**：Ant Design 组件和 Tailwind 样式正常生效
4. **路由正常工作**：React Router 路由切换正常
5. **代码规范**：ESLint 检查无错误
6. **打包成功**：运行 `npm run build` 能够成功构建应用

## 6. 风险与依赖 (Risks & Dependencies)

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Electron 与 Vite 版本兼容性 | 中 | 使用 electron-vite 官方推荐版本 |
| Tailwind 与 Ant Design 样式冲突 | 低 | 配置 Tailwind preflight 白名单 |
| TypeScript 配置复杂 | 低 | 使用脚手架默认配置 |

## 7. 预估工时 (Estimated Effort)

| 任务 | 预估时间 |
|------|----------|
| 项目初始化与依赖安装 | 30 分钟 |
| Tailwind CSS 配置 | 15 分钟 |
| Ant Design 配置 | 15 分钟 |
| 路由与布局搭建 | 30 分钟 |
| 代码规范配置 | 15 分钟 |
| 验证与调试 | 15 分钟 |
| **总计** | **约 2 小时** |

---

**审批状态**: ⏳ 待确认

**下一步**: 用户确认后，更新 `spec.md` 和 `tasks.md`，然后开始执行。
