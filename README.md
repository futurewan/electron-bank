# AI 对账助手 (Electron Bank)

基于 Electron + React + TypeScript 的智能对账桌面应用。

## 功能特性

- 📊 **智能对账**：导入账单数据，自动匹配和对账
- 🤖 **AI 分析**：集成 OpenAI API，提供智能分析和建议
- 💾 **本地存储**：使用 SQLite 数据库，数据完全本地化
- 🔐 **安全存储**：API Key 使用系统级加密存储
- 📁 **文件管理**：支持 Excel、CSV 文件导入导出

## 技术栈

- **前端**：React 18 + TypeScript + Zustand
- **桌面**：Electron 30
- **数据库**：SQLite + Drizzle ORM
- **配置**：electron-store
- **AI**：OpenAI API
- **构建**：Vite + electron-builder

## 开始使用

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 打包构建
npm run build
```

## 项目结构

```
electron-bank/
├── electron/                    # Electron 主进程代码
│   ├── main.ts                  # 主进程入口
│   ├── preload.ts               # 预加载脚本（暴露 API 给渲染进程）
│   ├── database/                # 数据库模块
│   │   ├── schema.ts            # Drizzle ORM 表结构定义
│   │   ├── client.ts            # 数据库连接管理
│   │   └── index.ts             # 模块导出
│   ├── config/                  # 配置模块
│   │   ├── store.ts             # 应用配置（主题、语言、窗口状态等）
│   │   └── aiStore.ts           # AI 配置和 API Key 安全存储
│   ├── services/                # 服务层
│   │   └── aiService.ts         # AI 服务（OpenAI API 封装）
│   ├── ipc/                     # IPC 通信层
│   │   ├── channels.ts          # IPC 通道常量定义
│   │   ├── index.ts             # IPC 处理器注册入口
│   │   └── handlers/            # IPC 处理器
│   │       ├── database.ts      # 数据库操作处理器
│   │       ├── config.ts        # 配置操作处理器
│   │       ├── file.ts          # 文件操作处理器
│   │       └── ai.ts            # AI 操作处理器
│   └── utils/                   # 工具函数
│       ├── paths.ts             # 路径管理（跨平台）
│       └── fileManager.ts       # 文件管理（导入导出）
│
├── src/                         # 渲染进程代码（React）
│   ├── App.tsx                  # 应用根组件
│   ├── main.tsx                 # 渲染进程入口
│   ├── components/              # UI 组件
│   │   ├── Layout/              # 布局组件
│   │   ├── Dashboard/           # 仪表盘组件
│   │   └── ...
│   ├── pages/                   # 页面组件
│   ├── stores/                  # Zustand 状态管理
│   │   ├── recordStore.ts       # 对账记录状态
│   │   └── configStore.ts       # 配置状态
│   ├── services/                # 服务层（调用 Electron API）
│   │   ├── database.ts          # 数据库服务
│   │   ├── config.ts            # 配置服务
│   │   ├── ai.ts                # AI 服务
│   │   ├── file.ts              # 文件服务
│   │   └── index.ts             # 统一导出
│   ├── types/                   # TypeScript 类型定义
│   │   ├── database.ts          # 数据库类型
│   │   ├── config.ts            # 配置类型
│   │   └── electron.d.ts        # Electron API 类型声明
│   └── styles/                  # 样式文件
│
├── openspec/                    # OpenSpec 规范文档
│   ├── config.yaml              # OpenSpec 配置
│   └── changes/                 # 变更记录
│       └── data-storage-and-ai/ # 数据存储和 AI 集成
│           ├── proposal.md      # 方案提案
│           ├── design.md        # 系统设计
│           ├── specs/           # 技术规格
│           └── tasks.md         # 任务清单
│
├── public/                      # 静态资源
├── dist/                        # 渲染进程构建输出
├── dist-electron/               # 主进程构建输出
└── release/                     # 打包输出
```

## 数据库表结构

| 表名 | 说明 |
|------|------|
| `reconciliation_records` | 对账记录主表 |
| `bills` | 账单明细表 |
| `transactions` | 交易流水表 |
| `ai_conversations` | AI 对话历史表 |

## 渲染进程 API

通过 `window.electron` 访问 Electron API：

```typescript
// 数据库操作
await window.electron.db.query('reconciliation_records', { pagination: { page: 1, pageSize: 20 } })
await window.electron.db.insert('bills', { type: 'income', amount: 100, date: new Date() })

// 配置操作
await window.electron.config.get('theme')
await window.electron.config.set('theme', 'dark')

// 文件操作
await window.electron.file.import('excel')
await window.electron.file.export(content, 'report.csv')

// AI 操作
await window.electron.ai.setKey('openai', 'sk-xxx')
await window.electron.ai.analyze(data, '请分析这份账单数据')

// 应用操作
await window.electron.app.getVersion()
await window.electron.app.openExternal('https://example.com')
```

## 数据存储位置

| 平台 | 路径 |
|------|------|
| macOS | `~/Library/Application Support/electron-bank/` |
| Windows | `%APPDATA%/electron-bank/` |
| Linux | `~/.config/electron-bank/` |

```
electron-bank/
├── database/
│   └── app.db           # SQLite 数据库
├── imports/             # 导入的文件
│   └── 2024-01/
├── exports/             # 导出的文件
│   └── 2024-01/
├── config.json          # 应用配置
├── ai-config.json       # AI 配置
└── ai-keys.json         # 加密的 API Key
```

## 开发说明

### 添加新的 IPC 通道

1. 在 `electron/ipc/channels.ts` 中定义通道常量
2. 在 `electron/ipc/handlers/` 下创建处理器
3. 在 `electron/ipc/index.ts` 中注册处理器
4. 在 `electron/preload.ts` 中暴露 API
5. 在 `src/types/electron.d.ts` 中添加类型声明
6. 在 `src/services/` 下封装服务层

### 添加新的数据库表

1. 在 `electron/database/schema.ts` 中定义表结构
2. 在 `electron/database/client.ts` 的 `initializeTables` 中添加建表 SQL
3. 在 `electron/ipc/handlers/database.ts` 的 `tableMap` 中注册表
4. 在 `src/types/database.ts` 中添加类型定义
5. 在 `src/services/database.ts` 中添加服务方法

## License

MIT
