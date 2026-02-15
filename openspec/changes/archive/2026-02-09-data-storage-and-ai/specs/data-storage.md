# 技术规格说明

## 1. 数据库 Schema

### 1.1 对账记录表 (reconciliation_records)

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID 主键 |
| bill_number | TEXT | NOT NULL | 账单编号 |
| amount | REAL | NOT NULL | 金额 |
| status | TEXT | NOT NULL | 状态: pending/matched/unmatched |
| ai_analysis | TEXT | | AI 分析结果 (JSON) |
| created_at | INTEGER | NOT NULL | 创建时间戳 |
| updated_at | INTEGER | NOT NULL | 更新时间戳 |

### 1.2 账单数据表 (bills)

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID 主键 |
| record_id | TEXT | FOREIGN KEY | 关联对账记录 |
| type | TEXT | NOT NULL | 类型: income/expense |
| amount | REAL | NOT NULL | 金额 |
| date | INTEGER | NOT NULL | 账单日期 |
| description | TEXT | | 描述 |
| source | TEXT | | 数据来源 |

### 1.3 交易明细表 (transactions)

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID 主键 |
| bill_id | TEXT | FOREIGN KEY | 关联账单 |
| amount | REAL | NOT NULL | 金额 |
| transaction_date | INTEGER | NOT NULL | 交易日期 |
| counterparty | TEXT | | 交易对手 |
| remark | TEXT | | 备注 |

### 1.4 AI 对话历史表 (ai_conversations)

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID 主键 |
| record_id | TEXT | FOREIGN KEY | 关联对账记录 |
| role | TEXT | NOT NULL | 角色: user/assistant |
| content | TEXT | NOT NULL | 消息内容 |
| model | TEXT | | 使用的模型 |
| token_count | INTEGER | | Token 消耗 |
| created_at | INTEGER | NOT NULL | 创建时间戳 |

---

## 2. 配置存储 Schema

### 2.1 应用配置 (config.json)

```typescript
interface AppConfig {
  // 界面配置
  theme: 'light' | 'dark' | 'auto'
  language: 'zh-CN' | 'en-US'
  
  // 窗口状态
  window: {
    width: number
    height: number
    x?: number
    y?: number
    maximized: boolean
  }
  
  // 功能配置
  autoSave: boolean
  exportPath: string
}
```

### 2.2 AI 配置 (ai-config.json)

```typescript
interface AIConfig {
  // 提供商选择
  provider: 'openai' | 'anthropic' | 'custom'
  
  // 模型配置
  model: string              // e.g., 'gpt-4o-mini'
  temperature: number        // 0-2
  maxTokens: number          // 最大 token 数
  
  // 自定义端点（可选）
  customEndpoint?: string
  
  // 统计（非加密）
  totalTokensUsed: number
  lastUsedAt: number
}
```

**注意**：API Key 使用 `safeStorage` 单独加密存储，不在此配置文件中。

---

## 3. IPC 通道定义

### 3.1 数据库通道

| 通道名 | 方向 | 参数 | 返回值 |
|--------|------|------|--------|
| `db:query` | invoke | { table, filter, pagination } | { data, total } |
| `db:insert` | invoke | { table, data } | { id } |
| `db:update` | invoke | { table, id, data } | { success } |
| `db:delete` | invoke | { table, id } | { success } |
| `db:batch-insert` | invoke | { table, items } | { ids } |

### 3.2 配置通道

| 通道名 | 方向 | 参数 | 返回值 |
|--------|------|------|--------|
| `config:get` | invoke | { key } | value |
| `config:set` | invoke | { key, value } | { success } |
| `config:getAll` | invoke | - | AppConfig |
| `config:reset` | invoke | - | { success } |

### 3.3 文件通道

| 通道名 | 方向 | 参数 | 返回值 |
|--------|------|------|--------|
| `file:import` | invoke | { type: 'excel'/'csv' } | { filePath, data } |
| `file:export` | invoke | { type, data, filename } | { filePath } |
| `file:list` | invoke | { directory } | { files } |
| `file:delete` | invoke | { filePath } | { success } |

### 3.4 AI 通道

| 通道名 | 方向 | 参数 | 返回值 |
|--------|------|------|--------|
| `ai:setKey` | invoke | { provider, apiKey } | { success } |
| `ai:checkKey` | invoke | { provider } | { valid, error? } |
| `ai:removeKey` | invoke | { provider } | { success } |
| `ai:getConfig` | invoke | - | AIConfig |
| `ai:setConfig` | invoke | AIConfig | { success } |
| `ai:analyze` | invoke | { data, prompt } | { result, tokens } |
| `ai:stream` | send/on | { data, prompt } | chunks (streaming) |

---

## 4. 文件目录结构

### 4.1 主进程代码结构

```
electron/
├── main.ts                     # 主进程入口
├── preload.ts                  # 预加载脚本
├── database/
│   ├── schema.ts               # Drizzle Schema 定义
│   ├── client.ts               # 数据库连接管理
│   ├── migrations/             # 迁移文件目录
│   └── index.ts                # 数据库服务导出
├── config/
│   ├── store.ts                # 应用配置管理
│   └── aiStore.ts              # AI 配置和 Key 管理
├── services/
│   ├── aiService.ts            # AI 服务封装
│   └── fileService.ts          # 文件服务
├── ipc/
│   ├── channels.ts             # IPC 通道常量
│   ├── index.ts                # IPC 注册入口
│   └── handlers/
│       ├── database.ts         # 数据库处理器
│       ├── config.ts           # 配置处理器
│       ├── file.ts             # 文件处理器
│       └── ai.ts               # AI 处理器
└── utils/
    ├── paths.ts                # 路径工具
    └── logger.ts               # 日志工具
```

### 4.2 渲染进程服务层

```
src/
├── services/
│   ├── database.ts             # 数据库调用封装
│   ├── config.ts               # 配置调用封装
│   ├── file.ts                 # 文件调用封装
│   └── ai.ts                   # AI 调用封装
└── types/
    ├── database.ts             # 数据库类型
    ├── config.ts               # 配置类型
    └── electron.d.ts           # Electron API 类型声明
```

### 4.3 本地存储目录

```
~/Library/Application Support/electron-bank/  (macOS)
%APPDATA%/electron-bank/                      (Windows)
~/.config/electron-bank/                      (Linux)

├── database/
│   └── app.db                  # SQLite 数据库文件
├── config/
│   ├── config.json             # 应用配置
│   └── ai-config.json          # AI 配置（不含 Key）
├── imports/                    # 导入的原始文件
├── exports/                    # 导出的报告
└── logs/
    └── app.log                 # 应用日志
```

---

## 5. API 类型定义

### 5.1 数据库类型

```typescript
// src/types/database.ts

export interface ReconciliationRecord {
  id: string
  billNumber: string
  amount: number
  status: 'pending' | 'matched' | 'unmatched'
  aiAnalysis?: string
  createdAt: Date
  updatedAt: Date
}

export interface Bill {
  id: string
  recordId?: string
  type: 'income' | 'expense'
  amount: number
  date: Date
  description?: string
  source?: string
}

export interface Transaction {
  id: string
  billId?: string
  amount: number
  transactionDate: Date
  counterparty?: string
  remark?: string
}

export interface AIConversation {
  id: string
  recordId?: string
  role: 'user' | 'assistant'
  content: string
  model?: string
  tokenCount?: number
  createdAt: Date
}
```

### 5.2 查询参数类型

```typescript
export interface QueryFilter {
  where?: Record<string, any>
  orderBy?: { field: string; direction: 'asc' | 'desc' }
  pagination?: { page: number; pageSize: number }
}

export interface QueryResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}
```

### 5.3 Electron API 类型

```typescript
// src/types/electron.d.ts

declare global {
  interface Window {
    electron: {
      db: {
        query: <T>(table: string, filter?: QueryFilter) => Promise<QueryResult<T>>
        insert: <T>(table: string, data: Partial<T>) => Promise<{ id: string }>
        update: (table: string, id: string, data: Record<string, any>) => Promise<{ success: boolean }>
        delete: (table: string, id: string) => Promise<{ success: boolean }>
      }
      config: {
        get: <T>(key: string) => Promise<T>
        set: (key: string, value: any) => Promise<{ success: boolean }>
        getAll: () => Promise<AppConfig>
      }
      file: {
        import: (type: 'excel' | 'csv') => Promise<{ filePath: string; data: any[] }>
        export: (type: string, data: any, filename: string) => Promise<{ filePath: string }>
      }
      ai: {
        setKey: (provider: string, apiKey: string) => Promise<{ success: boolean }>
        checkKey: (provider: string) => Promise<{ valid: boolean; error?: string }>
        analyze: (data: any, prompt: string) => Promise<{ result: string; tokens: number }>
      }
    }
  }
}
```

---

## 6. 安全规范

### 6.1 API Key 存储

```typescript
// 使用 Electron safeStorage API
import { safeStorage } from 'electron'

// 加密
const encrypted = safeStorage.encryptString(apiKey)
store.set(`keys.${provider}`, encrypted.toString('base64'))

// 解密
const encrypted = Buffer.from(store.get(`keys.${provider}`), 'base64')
const apiKey = safeStorage.decryptString(encrypted)
```

### 6.2 日志安全

- API Key 不得出现在日志中
- 敏感数据需要脱敏后再记录
- 错误信息不暴露内部实现细节

### 6.3 文件权限

- 数据库文件：0600（仅当前用户可读写）
- 配置文件：0600（仅当前用户可读写）
