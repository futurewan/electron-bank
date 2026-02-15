# 任务清单

## 概览

| 阶段 | 任务数 | 预估时间 | 状态 |
|------|--------|----------|------|
| Phase 1: 本地存储基础 | 5 | 3-4h | ✅ 完成 |
| Phase 2: IPC 通信层 | 5 | 2-3h | ✅ 完成 |
| Phase 3: AI 集成 | 4 | 2-3h | ✅ 完成 |
| Phase 4: 渲染进程集成 | 4 | 2h | ✅ 完成 |
| **总计** | **18** | **9-12h** | ✅ **完成** |

---

## Phase 1: 本地存储基础 ✅

### Task 1.1: 安装存储相关依赖
- [x] **状态**: 已完成
- **时间**: 30 分钟
- **描述**: 安装 SQLite、Drizzle ORM、electron-store 等依赖
- **完成内容**:
  - ✅ better-sqlite3, drizzle-orm, electron-store
  - ✅ drizzle-kit, @types/better-sqlite3
  - ✅ uuid, @types/uuid, openai

---

### Task 1.2: 创建数据库 Schema
- [x] **状态**: 已完成
- **文件**: `electron/database/schema.ts`
- **完成内容**:
  - ✅ reconciliation_records 表
  - ✅ bills 表
  - ✅ transactions 表
  - ✅ ai_conversations 表
  - ✅ 索引定义
  - ✅ 类型导出

---

### Task 1.3: 创建数据库连接管理
- [x] **状态**: 已完成
- **文件**:
  - `electron/database/client.ts`
  - `electron/database/index.ts`
- **完成内容**:
  - ✅ 懒加载数据库连接
  - ✅ 自动创建表结构
  - ✅ 关闭连接方法
  - ✅ 备份功能

---

### Task 1.4: 配置 electron-store
- [x] **状态**: 已完成
- **文件**: `electron/config/store.ts`
- **完成内容**:
  - ✅ AppConfig 类型定义
  - ✅ JSON Schema 验证
  - ✅ 默认值设置
  - ✅ 窗口状态管理
  - ✅ 最近文件管理

---

### Task 1.5: 创建路径和文件工具
- [x] **状态**: 已完成
- **文件**:
  - `electron/utils/paths.ts`
  - `electron/utils/fileManager.ts`
- **完成内容**:
  - ✅ 跨平台路径处理
  - ✅ 文件导入/导出
  - ✅ 文件列表
  - ✅ 文件清理

---

## Phase 2: IPC 通信层 ✅

### Task 2.1: 定义 IPC 通道常量
- [x] **状态**: 已完成
- **文件**: `electron/ipc/channels.ts`
- **完成内容**:
  - ✅ DB_CHANNELS
  - ✅ CONFIG_CHANNELS
  - ✅ FILE_CHANNELS
  - ✅ AI_CHANNELS
  - ✅ APP_CHANNELS

---

### Task 2.2: 实现数据库 IPC 处理器
- [x] **状态**: 已完成
- **文件**: `electron/ipc/handlers/database.ts`
- **完成内容**:
  - ✅ handleDbQuery
  - ✅ handleDbInsert
  - ✅ handleDbUpdate
  - ✅ handleDbDelete
  - ✅ handleDbBatchInsert

---

### Task 2.3: 实现配置 IPC 处理器
- [x] **状态**: 已完成
- **文件**: `electron/ipc/handlers/config.ts`
- **完成内容**:
  - ✅ handleGetConfig
  - ✅ handleSetConfig
  - ✅ handleGetAllConfig
  - ✅ handleResetConfig

---

### Task 2.4: 实现文件 IPC 处理器
- [x] **状态**: 已完成
- **文件**: `electron/ipc/handlers/file.ts`
- **完成内容**:
  - ✅ handleFileImport
  - ✅ handleFileExport
  - ✅ handleListImports
  - ✅ handleListExports
  - ✅ handleDeleteFile
  - ✅ handleOpenDialog
  - ✅ handleSaveDialog

---

### Task 2.5: 更新 preload.ts 暴露 API
- [x] **状态**: 已完成
- **文件**: `electron/preload.ts`
- **完成内容**:
  - ✅ window.electron.db.*
  - ✅ window.electron.config.*
  - ✅ window.electron.file.*
  - ✅ window.electron.ai.*
  - ✅ window.electron.app.*

---

## Phase 3: AI 集成 ✅

### Task 3.1: 安装 AI 相关依赖
- [x] **状态**: 已完成
- **完成内容**:
  - ✅ openai SDK

---

### Task 3.2: 实现 API Key 安全存储
- [x] **状态**: 已完成
- **文件**: `electron/config/aiStore.ts`
- **完成内容**:
  - ✅ AIKeyManager 类
  - ✅ safeStorage 加密
  - ✅ aiConfig 管理
  - ✅ Token 使用统计

---

### Task 3.3: 封装 AI 服务
- [x] **状态**: 已完成
- **文件**: `electron/services/aiService.ts`
- **完成内容**:
  - ✅ AIService 类
  - ✅ analyze 方法
  - ✅ detectAnomalies 方法
  - ✅ generateReport 方法
  - ✅ chat 方法
  - ✅ 错误处理

---

### Task 3.4: 实现 AI IPC 处理器
- [x] **状态**: 已完成
- **文件**: `electron/ipc/handlers/ai.ts`
- **完成内容**:
  - ✅ handleSetKey
  - ✅ handleCheckKey
  - ✅ handleRemoveKey
  - ✅ handleGetConfig
  - ✅ handleSetConfig
  - ✅ handleAnalyze

---

## Phase 4: 渲染进程集成 ✅

### Task 4.1: 创建 Electron API 类型定义
- [x] **状态**: 已完成
- **文件**:
  - `src/types/database.ts`
  - `src/types/config.ts`
  - `src/types/electron.d.ts`
- **完成内容**:
  - ✅ 数据库类型
  - ✅ 配置类型
  - ✅ Electron API 类型声明

---

### Task 4.2: 创建渲染进程服务层
- [x] **状态**: 已完成
- **文件**:
  - `src/services/database.ts`
  - `src/services/config.ts`
  - `src/services/ai.ts`
  - `src/services/file.ts`
  - `src/services/index.ts`
- **完成内容**:
  - ✅ recordService
  - ✅ billService
  - ✅ transactionService
  - ✅ conversationService
  - ✅ configService
  - ✅ aiService
  - ✅ fileService

---

### Task 4.3: 更新 Zustand Store
- [x] **状态**: 已完成
- **文件**:
  - `src/stores/recordStore.ts`
  - `src/stores/configStore.ts`
- **完成内容**:
  - ✅ useRecordStore（带缓存）
  - ✅ useConfigStore

---

### Task 4.4: 集成测试和验证
- [x] **状态**: 已完成
- **说明**: 需要重启开发服务器进行验证

---

## 完成检查清单

- [x] 所有依赖安装成功
- [x] 数据库 Schema 定义完成
- [x] 数据库连接管理实现
- [x] 配置存储实现
- [x] IPC 通道全部注册
- [x] API Key 安全存储实现
- [x] AI 服务封装完成
- [x] 渲染进程服务层完成
- [x] Zustand Store 更新完成
- [x] 类型定义完成

---

## 创建的文件清单

### 主进程 (electron/)
```
electron/
├── main.ts                     # 更新：集成 IPC 和数据库
├── preload.ts                  # 更新：暴露完整 API
├── database/
│   ├── schema.ts               # 新增：数据库 Schema
│   ├── client.ts               # 新增：数据库连接
│   └── index.ts                # 新增：导出入口
├── config/
│   ├── store.ts                # 新增：应用配置
│   └── aiStore.ts              # 新增：AI 配置
├── services/
│   └── aiService.ts            # 新增：AI 服务
├── ipc/
│   ├── channels.ts             # 新增：通道常量
│   ├── index.ts                # 新增：注册入口
│   └── handlers/
│       ├── database.ts         # 新增：数据库处理器
│       ├── config.ts           # 新增：配置处理器
│       ├── file.ts             # 新增：文件处理器
│       └── ai.ts               # 新增：AI 处理器
└── utils/
    ├── paths.ts                # 新增：路径工具
    └── fileManager.ts          # 新增：文件管理
```

### 渲染进程 (src/)
```
src/
├── types/
│   ├── database.ts             # 新增：数据库类型
│   ├── config.ts               # 新增：配置类型
│   └── electron.d.ts           # 更新：Electron API 类型
├── services/
│   ├── database.ts             # 新增：数据库服务
│   ├── config.ts               # 新增：配置服务
│   ├── ai.ts                   # 新增：AI 服务
│   ├── file.ts                 # 新增：文件服务
│   └── index.ts                # 新增：导出入口
└── stores/
    ├── recordStore.ts          # 新增：对账记录 Store
    └── configStore.ts          # 新增：配置 Store
```

---

## 后续优化（非本次范围）

- [ ] 数据库迁移机制
- [ ] 数据备份/恢复功能
- [ ] AI 流式响应支持
- [ ] Token 消耗统计页面
- [ ] 设置页面 UI
- [ ] 错误边界和全局错误处理
