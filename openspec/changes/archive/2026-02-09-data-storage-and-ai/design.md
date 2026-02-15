# 系统设计文档

## 1. 架构总览

### 1.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              用户电脑                                    │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                        Electron 对账助手                           │  │
│  │                                                                   │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │                     渲染进程 (Renderer)                       │  │  │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │  │  │
│  │  │  │ React UI    │  │ Zustand     │  │ Service Layer       │   │  │  │
│  │  │  │ Components  │→│ Stores      │→│ (database/config/ai)│ │   │  │  │
│  │  │  └─────────────┘  └─────────────┘  └──────────┬──────────┘   │  │  │
│  │  └────────────────────────────────────────────────│─────────────┘  │  │
│  │                                                   │                │  │
│  │                                          IPC (contextBridge)       │  │
│  │                                                   │                │  │
│  │  ┌────────────────────────────────────────────────│─────────────┐  │  │
│  │  │                     主进程 (Main)               ↓             │  │  │
│  │  │  ┌────────────────────────────────────────────────────────┐  │  │  │
│  │  │  │                    IPC Handlers                        │  │  │  │
│  │  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │  │  │  │
│  │  │  │  │ database │ │ config   │ │ file     │ │ ai       │   │  │  │  │
│  │  │  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘   │  │  │  │
│  │  │  └───────│────────────│────────────│────────────│─────────┘  │  │  │
│  │  │          ↓            ↓            ↓            ↓             │  │
│  │  │  ┌──────────────────────────────────────────────────────────┐ │  │
│  │  │  │                    Services Layer                        │ │  │
│  │  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │ │  │
│  │  │  │  │ Database │ │ Config   │ │ File     │ │ AI Service   │ │ │  │
│  │  │  │  │ (Drizzle)│ │ (Store)  │ │ (fs)     │ │ (OpenAI SDK) │ │ │  │
│  │  │  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘ │ │  │
│  │  │  └───────│────────────│────────────│──────────────│─────────┘ │  │
│  │  └──────────│────────────│────────────│──────────────│───────────┘  │
│  └─────────────│────────────│────────────│──────────────│──────────────┘  │
│                ↓            ↓            ↓              ↓               │
│  ┌─────────────────────────────────────────────┐  ┌─────────────────┐   │
│  │              本地文件系统                     │  │   HTTPS 请求    │   │
│  │  ┌─────────────┐  ┌─────────────────────┐   │  └────────┬────────┘   │
│  │  │ app.db      │  │ config.json         │   │           │            │
│  │  │ (SQLite)    │  │ ai-config.json      │   │           │            │
│  │  └─────────────┘  │ imports/ exports/   │   │           │            │
│  │                   └─────────────────────┘   │           │            │
│  └─────────────────────────────────────────────┘           │            │
└────────────────────────────────────────────────────────────│────────────┘
                                                             ↓
                                               ┌─────────────────────────┐
                                               │   第三方 AI API          │
                                               │   (OpenAI / Claude)     │
                                               └─────────────────────────┘
```

---

## 2. 核心模块设计

### 2.1 数据库模块

```
electron/database/
├── schema.ts       # Drizzle ORM Schema 定义
├── client.ts       # 数据库连接管理
├── migrations/     # 数据库迁移文件
└── index.ts        # 导出入口
```

#### 2.1.1 连接管理

```typescript
// client.ts 核心逻辑
class DatabaseClient {
  private db: BetterSqlite3.Database | null = null
  
  // 懒加载连接
  getConnection(): BetterSqlite3.Database {
    if (!this.db) {
      const dbPath = path.join(app.getPath('userData'), 'database', 'app.db')
      ensureDir(path.dirname(dbPath))
      this.db = new Database(dbPath)
      this.runMigrations()
    }
    return this.db
  }
  
  // 应用退出时关闭
  close(): void {
    this.db?.close()
    this.db = null
  }
}
```

#### 2.1.2 数据流

```
渲染进程                    主进程                      文件系统
    │                         │                           │
    │  invoke('db:query')     │                           │
    │ ───────────────────────>│                           │
    │                         │  Drizzle ORM Query        │
    │                         │ ─────────────────────────>│
    │                         │                           │
    │                         │  SQLite Result            │
    │                         │ <─────────────────────────│
    │  { data, total }        │                           │
    │ <───────────────────────│                           │
```

---

### 2.2 配置模块

```
electron/config/
├── store.ts        # 应用配置管理
└── aiStore.ts      # AI 配置和 Key 管理
```

#### 2.2.1 配置分层

```typescript
// 配置层次设计
{
  // Layer 1: 默认值（代码内置）
  defaults: {
    theme: 'auto',
    language: 'zh-CN',
    autoSave: true
  },
  
  // Layer 2: 用户配置（electron-store）
  // 存储在 ~/AppData/electron-bank/config.json
  
  // Layer 3: 运行时覆盖（内存）
  // 临时配置，应用重启后失效
}
```

#### 2.2.2 API Key 安全架构

```
┌──────────────────────────────────────────────────────────────┐
│                    API Key 存储流程                          │
│                                                              │
│  用户输入 API Key                                            │
│         │                                                    │
│         ↓                                                    │
│  ┌──────────────┐                                           │
│  │ 渲染进程      │  invoke('ai:setKey', { provider, key })  │
│  └──────┬───────┘                                           │
│         │                                                    │
│         ↓  IPC                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 主进程                                                │   │
│  │  ┌─────────────────────────────────────────────────┐ │   │
│  │  │ AIKeyManager                                    │ │   │
│  │  │  1. 验证 Key 格式                               │ │   │
│  │  │  2. safeStorage.encryptString(apiKey)          │ │   │
│  │  │  3. store.set('keys.openai', encrypted)        │ │   │
│  │  └─────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           ↓                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 本地存储 (ai-config.json)                            │   │
│  │ {                                                    │   │
│  │   "keys": {                                          │   │
│  │     "openai": "AES256:xxxxxxxxxxxx"  // 加密后      │   │
│  │   }                                                  │   │
│  │ }                                                    │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

---

### 2.3 AI 模块

```
electron/services/
└── aiService.ts    # AI 服务封装
```

#### 2.3.1 AI 调用流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AI 分析调用流程                               │
│                                                                     │
│  1. 用户触发分析                                                     │
│     │                                                               │
│     ↓                                                               │
│  ┌────────────────────┐                                            │
│  │ 渲染进程            │                                            │
│  │ aiService.analyze() │                                            │
│  └─────────┬──────────┘                                            │
│            │ invoke('ai:analyze', { data, prompt })                 │
│            ↓                                                        │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ 主进程 - AI Handler                                        │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │ 1. 获取 API Key (从加密存储解密)                      │  │    │
│  │  │ 2. 构建 OpenAI 客户端                                 │  │    │
│  │  │ 3. 构建 Prompt (系统提示 + 用户数据)                   │  │    │
│  │  │ 4. 调用 API                                          │  │    │
│  │  │ 5. 记录 Token 消耗                                    │  │    │
│  │  │ 6. 保存对话历史到 SQLite                              │  │    │
│  │  │ 7. 返回结果                                          │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────┬──────────────────────────────┘    │
│                                │                                    │
│                                ↓ HTTPS                             │
│                    ┌───────────────────────┐                       │
│                    │ OpenAI API            │                       │
│                    │ POST /v1/chat/completions                     │
│                    └───────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────┘
```

#### 2.3.2 错误处理策略

```typescript
// 错误分类和处理
enum AIErrorType {
  NO_API_KEY = 'NO_API_KEY',        // 未配置 Key
  INVALID_KEY = 'INVALID_KEY',      // Key 无效
  RATE_LIMIT = 'RATE_LIMIT',        // 频率限制
  NETWORK_ERROR = 'NETWORK_ERROR',  // 网络错误
  SERVICE_ERROR = 'SERVICE_ERROR',  // 服务端错误
}

// 用户友好的错误消息
const errorMessages = {
  NO_API_KEY: '请先在设置中配置 AI API Key',
  INVALID_KEY: 'API Key 无效，请检查配置',
  RATE_LIMIT: '请求过于频繁，请稍后再试',
  NETWORK_ERROR: '网络连接失败，请检查网络',
  SERVICE_ERROR: 'AI 服务暂时不可用，请稍后再试',
}
```

---

### 2.4 IPC 通信模块

```
electron/ipc/
├── channels.ts     # 通道常量定义
├── index.ts        # 注册入口
└── handlers/
    ├── database.ts # 数据库处理器
    ├── config.ts   # 配置处理器
    ├── file.ts     # 文件处理器
    └── ai.ts       # AI 处理器
```

#### 2.4.1 IPC 注册流程

```typescript
// electron/ipc/index.ts
export function registerIpcHandlers() {
  // 数据库通道
  ipcMain.handle(IPC_CHANNELS.DB_QUERY, handleDbQuery)
  ipcMain.handle(IPC_CHANNELS.DB_INSERT, handleDbInsert)
  ipcMain.handle(IPC_CHANNELS.DB_UPDATE, handleDbUpdate)
  ipcMain.handle(IPC_CHANNELS.DB_DELETE, handleDbDelete)
  
  // 配置通道
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, handleConfigGet)
  ipcMain.handle(IPC_CHANNELS.CONFIG_SET, handleConfigSet)
  
  // 文件通道
  ipcMain.handle(IPC_CHANNELS.FILE_IMPORT, handleFileImport)
  ipcMain.handle(IPC_CHANNELS.FILE_EXPORT, handleFileExport)
  
  // AI 通道
  ipcMain.handle(IPC_CHANNELS.AI_SET_KEY, handleAiSetKey)
  ipcMain.handle(IPC_CHANNELS.AI_ANALYZE, handleAiAnalyze)
}
```

#### 2.4.2 Preload 桥接

```typescript
// electron/preload.ts
contextBridge.exposeInMainWorld('electron', {
  db: {
    query: (table, filter) => ipcRenderer.invoke('db:query', { table, filter }),
    insert: (table, data) => ipcRenderer.invoke('db:insert', { table, data }),
    update: (table, id, data) => ipcRenderer.invoke('db:update', { table, id, data }),
    delete: (table, id) => ipcRenderer.invoke('db:delete', { table, id }),
  },
  config: {
    get: (key) => ipcRenderer.invoke('config:get', { key }),
    set: (key, value) => ipcRenderer.invoke('config:set', { key, value }),
    getAll: () => ipcRenderer.invoke('config:getAll'),
  },
  file: {
    import: (type) => ipcRenderer.invoke('file:import', { type }),
    export: (type, data, filename) => ipcRenderer.invoke('file:export', { type, data, filename }),
  },
  ai: {
    setKey: (provider, apiKey) => ipcRenderer.invoke('ai:setKey', { provider, apiKey }),
    checkKey: (provider) => ipcRenderer.invoke('ai:checkKey', { provider }),
    analyze: (data, prompt) => ipcRenderer.invoke('ai:analyze', { data, prompt }),
  },
})
```

---

## 3. 渲染进程服务层设计

### 3.1 服务层架构

```
┌─────────────────────────────────────────────────────────────┐
│                      渲染进程                                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    React Components                    │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │  │
│  │  │ Pages   │  │ UI      │  │ Forms   │  │ Modals  │  │  │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  │  │
│  └───────│────────────│────────────│────────────│────────┘  │
│          └────────────┴────────────┴────────────┘           │
│                              │                               │
│                              ↓                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    Zustand Stores                      │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │  │
│  │  │ recordStore │  │ configStore │  │ aiStore     │    │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │  │
│  └─────────│────────────────│────────────────│───────────┘  │
│            └────────────────┼────────────────┘              │
│                             ↓                                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                   Service Layer                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │  │
│  │  │ database.ts │  │ config.ts   │  │ ai.ts       │    │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │  │
│  └─────────│────────────────│────────────────│───────────┘  │
│            └────────────────┼────────────────┘              │
│                             ↓                                │
│                     window.electron.*                        │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 服务封装示例

```typescript
// src/services/database.ts
export const databaseService = {
  // 对账记录
  records: {
    list: (filter?: QueryFilter) => 
      window.electron.db.query<ReconciliationRecord>('reconciliation_records', filter),
    
    create: (data: Partial<ReconciliationRecord>) =>
      window.electron.db.insert('reconciliation_records', data),
    
    update: (id: string, data: Partial<ReconciliationRecord>) =>
      window.electron.db.update('reconciliation_records', id, data),
    
    delete: (id: string) =>
      window.electron.db.delete('reconciliation_records', id),
  },
  
  // 账单
  bills: {
    list: (filter?: QueryFilter) =>
      window.electron.db.query<Bill>('bills', filter),
    // ...
  },
}
```

---

## 4. 关键决策记录

### 4.1 为什么选择 SQLite + Drizzle

| 考虑因素 | SQLite + Drizzle | 其他方案 |
|----------|------------------|----------|
| 类型安全 | ✅ 完整 TS 支持 | IndexedDB 较弱 |
| 查询能力 | ✅ 完整 SQL | LocalStorage 无 |
| 性能 | ✅ 本地文件，快 | 同等 |
| 迁移 | ✅ Drizzle Kit | 需自行实现 |
| 学习曲线 | 中等 | 低 |

### 4.2 为什么 API Key 在主进程管理

| 考虑因素 | 主进程管理 | 渲染进程管理 |
|----------|------------|--------------|
| 安全性 | ✅ 无法通过 DevTools 获取 | ❌ 可能泄露 |
| 加密能力 | ✅ 可用 safeStorage | ❌ 无系统级加密 |
| 网络请求 | ✅ Node.js 原生 | ❌ 浏览器限制 |

### 4.3 为什么不使用后端服务

| 考虑因素 | 本地直连 | 后端中转 |
|----------|----------|----------|
| 部署复杂度 | ✅ 低 | 高 |
| 运维成本 | ✅ 无 | 有 |
| 延迟 | ✅ 低 | 高 |
| 隐私 | ✅ 数据不经过第三方 | 需信任后端 |
| 离线能力 | ✅ 核心功能可用 | 完全依赖网络 |

---

## 5. 性能考虑

### 5.1 数据库优化

```typescript
// 索引设计
const indexes = {
  reconciliationRecords: [
    'idx_bill_number',     // 按账单号查询
    'idx_status',          // 按状态筛选
    'idx_created_at',      // 按创建时间排序
  ],
  bills: [
    'idx_record_id',       // 关联查询
    'idx_date',            // 按日期范围查询
  ],
}
```

### 5.2 缓存策略

```typescript
// Zustand 作为一级缓存
const useRecordStore = create((set, get) => ({
  records: [],
  cacheTime: 0,
  
  loadRecords: async (force = false) => {
    // 5 分钟内不重复加载
    if (!force && Date.now() - get().cacheTime < 5 * 60 * 1000) {
      return
    }
    
    const result = await databaseService.records.list()
    set({ records: result.data, cacheTime: Date.now() })
  },
}))
```

### 5.3 大数据处理

```typescript
// 分页加载
const defaultPagination = {
  page: 1,
  pageSize: 50,  // 默认每页 50 条
  maxPageSize: 200,  // 最大每页 200 条
}

// 虚拟滚动（UI 层）
// 使用 react-virtual 或 antd Table 虚拟滚动
```

---

## 6. 错误处理设计

### 6.1 错误边界

```typescript
// 全局错误分类
enum ErrorCode {
  // 数据库错误
  DB_CONNECTION_FAILED = 'DB_001',
  DB_QUERY_FAILED = 'DB_002',
  DB_MIGRATION_FAILED = 'DB_003',
  
  // 配置错误
  CONFIG_READ_FAILED = 'CFG_001',
  CONFIG_WRITE_FAILED = 'CFG_002',
  
  // AI 错误
  AI_NO_KEY = 'AI_001',
  AI_INVALID_KEY = 'AI_002',
  AI_NETWORK_ERROR = 'AI_003',
  AI_SERVICE_ERROR = 'AI_004',
  
  // 文件错误
  FILE_NOT_FOUND = 'FILE_001',
  FILE_PARSE_ERROR = 'FILE_002',
}
```

### 6.2 用户反馈

```typescript
// 统一错误提示
const showError = (error: AppError) => {
  notification.error({
    message: error.title,
    description: error.message,
    duration: 5,
  })
  
  // 开发环境输出详细信息
  if (isDev) {
    console.error(error)
  }
}
```
