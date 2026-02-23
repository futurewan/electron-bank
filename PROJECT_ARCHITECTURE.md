# 银企自动核销 Agent — 项目技术架构与详细流程总结

> 生成时间：2026-02-22  
> 项目路径：`electron-bank/`

---

## 一、项目概览

| 属性 | 内容 |
|------|------|
| **项目名称** | 银企自动核销 Agent（桌面版） |
| **核心定位** | 基于 RPA（规则执行）+ AI（语义判断）的本地化财务核销工具 |
| **适用场景** | 财务人员在月结/季结时，对银行流水与发票进行批量比对核销 |
| **核心价值** | 解决"金额微差（手续费）"和"人名不符（代付）"的人工核对痛点 |
| **运行方式** | 本地桌面应用，数据完全不上云 |

---

## 二、技术栈全景

### 前端（渲染进程）
| 技术 | 版本 | 作用 |
|------|------|------|
| React | 18.2 | UI 框架 |
| TypeScript | 5.2 | 类型系统 |
| React Router DOM | 7.x | 页面路由 |
| Zustand | 5.x | 全局状态管理 |
| Ant Design | 6.x | UI 组件库 |
| Lucide React | 0.563 | 图标库 |
| TailwindCSS | 4.x | 样式工具 |
| Sass | - | CSS 预处理器 |

### 后端（主进程 / Electron）
| 技术 | 版本 | 作用 |
|------|------|------|
| Electron | 30 | 桌面应用壳 |
| Node.js | - | 主进程运行时 |
| better-sqlite3 | 12.x | 本地 SQLite 数据库驱动 |
| Drizzle ORM | 0.45 | 类型安全的 ORM |
| electron-store | 11.x | JSON 配置持久化 |
| xlsx | 0.18 | Excel 文件读写 |
| uuid | 13.x | UUID 生成 |
| axios | 1.x | HTTP 客户端（调用 AI API） |
| openai | 6.x | OpenAI SDK（兼容 DeepSeek） |

### AI 引擎
| 技术 | 作用 |
|------|------|
| DeepSeek API | 语义匹配、代付识别、异常诊断、PDF 修复 |
| 自定义 Endpoint | 支持兼容 OpenAI 协议的任意本地/云端模型 |

### 数据处理（Python 子进程）
| 技术 | 版本 | 作用 |
|------|------|------|
| Python | 3.x | 脚本运行时 |
| pdfplumber | - | PDF 文本层提取 |
| pandas | - | Excel 导出 |
| dataclasses | - | 数据结构定义 |

### 构建与打包
| 技术 | 作用 |
|------|------|
| Vite | 前端构建，开发热更新 |
| vite-plugin-electron | 联合打包主进程 |
| electron-builder | 生成 macOS/Windows 安装包 |
| electron-rebuild | 重编译原生模块（better-sqlite3） |

---

## 三、项目目录结构

```
electron-bank/
├── electron/                        # Electron 主进程（后端核心）
│   ├── main.ts                      # 应用入口：初始化、窗口管理、IPC注册
│   ├── preload.ts                   # 预加载脚本：向渲染进程暴露安全 API
│   ├── database/
│   │   ├── schema.ts                # Drizzle ORM 表结构定义（11张核心表）
│   │   ├── client.ts                # 数据库连接与表初始化
│   │   └── index.ts                 # 模块导出
│   ├── config/
│   │   ├── store.ts                 # 应用配置（工作目录、窗口状态、主题等）
│   │   └── aiStore.ts               # AI 配置 + API Key 加密存储
│   ├── ipc/
│   │   ├── channels.ts              # 所有 IPC 通道常量定义（约50个通道）
│   │   ├── index.ts                 # IPC 处理器注册总入口
│   │   └── handlers/
│   │       ├── reconciliation.ts    # 核销相关的所有 IPC 处理（最核心，26KB）
│   │       ├── ai.ts                # AI 配置与调用处理器
│   │       ├── config.ts            # 应用配置处理器
│   │       ├── database.ts          # 数据库 CRUD 处理器
│   │       └── file.ts              # 文件操作处理器
│   ├── services/                    # 服务层（业务逻辑核心）
│   │   ├── reconciliationService.ts # 核销流程编排器（核心调度中枢）
│   │   ├── importService.ts         # 数据导入服务（银行流水/发票/映射导入）
│   │   ├── parseService.ts          # 文件解析服务（Excel/CSV/PDF基础文本）
│   │   ├── invoiceParseService.ts   # PDF发票解析服务（调用Python脚本）
│   │   ├── matchingService.ts       # 规则匹配引擎（三级漏斗第一层+第二层）
│   │   ├── aiMatchingService.ts     # AI语义匹配服务（代付识别）
│   │   ├── exceptionService.ts      # 异常检测服务（有水无票/重复支付等）
│   │   ├── reportService.ts         # 报告生成服务（三类Excel报告）
│   │   ├── archiveService.ts        # 归档服务（文件移动+批次归档）
│   │   ├── folderService.ts         # 文件夹管理（工作目录结构初始化）
│   │   ├── mappingService.ts        # 付款人映射管理（代付关系数据库）
│   │   ├── aiService.ts             # AI服务封装（DeepSeek API单例）
│   │   ├── pythonService.ts         # Python 子进程管理器
│   │   └── taskService.ts           # 任务中断控制（stop flag）
│   ├── python/                      # Python 脚本
│   │   ├── invoice_parser.py        # 中国电子发票 PDF 解析器（核心，757行）
│   │   ├── models.py                # 数据结构定义（与 TS 保持一致）
│   │   ├── main.py                  # Python 脚本入口（CLI 接口）
│   │   ├── requirements.txt         # Python 依赖（pdfplumber 等）
│   │   └── .venv/                   # Python 虚拟环境
│   └── utils/
│       ├── paths.ts                 # 应用数据目录路径管理
│       └── workspacePaths.ts        # 工作目录结构路径常量
│
├── src/                             # 渲染进程（前端 React）
│   ├── App.tsx                      # 根组件
│   ├── main.tsx                     # 渲染进程入口
│   ├── router/
│   │   └── index.tsx                # 路由配置（6个页面）
│   ├── pages/
│   │   ├── Home/                    # 首页（批次列表/快速开始）
│   │   ├── Reconciliation/          # 核销工作台（数据导入/执行核销）
│   │   ├── ReconciliationDetail/    # 核销结果详情（匹配明细/异常列表）
│   │   ├── Reports/                 # 报告管理（报告列表/下载）
│   │   ├── PayerMappings/           # 付款人映射管理（代付关系维护）
│   │   └── Settings/                # 应用设置（工作目录/AI配置）
│   ├── components/
│   │   ├── Layout/                  # 侧边栏导航布局
│   │   ├── FolderConfigModal/       # 工作目录配置弹窗
│   │   ├── ImportConfirmModal/      # 导入确认弹窗
│   │   ├── MappingReminderModal/    # 映射配置提醒弹窗
│   │   └── ProtectedRoute/          # 路由守卫（登录检查）
│   ├── stores/
│   │   ├── authStore.ts             # 认证状态（用户登录信息）
│   │   ├── configStore.ts           # 配置状态（工作目录/AI配置）
│   │   ├── recordStore.ts           # 对账记录状态
│   │   └── appStore.ts              # 全局应用状态（加载中/错误）
│   └── services/                    # 前端服务层（调用 window.electron API）
│       ├── database.ts
│       ├── config.ts
│       ├── ai.ts
│       ├── file.ts
│       └── index.ts
│
├── openspec/                        # OpenSpec 变更管理目录
├── .agent/                          # AI Agent 技能/工作流配置
├── demand.md                        # 原始产品需求文档（PRD）
├── style.md                         # UI 设计风格指南
└── test-data/                       # 测试数据
```

---

## 四、数据库表结构

系统使用本地 SQLite，共 **11 张表**，分两组：

### 4.1 原始基础表（早期遗留）
| 表名 | 说明 |
|------|------|
| `reconciliation_records` | 对账记录主表 |
| `bills` | 账单明细 |
| `transactions` | 交易流水 |
| `ai_conversations` | AI 对话历史 |

### 4.2 核销业务核心表（主要在用）
| 表名 | 说明 | 关键字段 |
|------|------|---------|
| `reconciliation_batches` | **核销批次表** | id, name, status(pending/matching/completed/failed/unbalanced/archived), totalBankCount, totalInvoiceCount, matchedCount, unmatchedCount, exceptionCount |
| `bank_transactions` | **银行流水表** | batchId, payerName, payerAccount, amount, transactionDate, status(pending/matched/unmatched/exception), matchId |
| `invoices` | **发票数据表** | batchId, invoiceCode, invoiceNumber, sellerName, amount, buyerName, taxAmount, taxRate, invoiceType, parseSource, sourceFilePath |
| `payer_mappings` | **付款人映射表** | personName, companyName, accountSuffix, source(manual/ai_extracted/imported/quick_add) |
| `match_results` | **匹配结果表** | bankId, invoiceId, matchType(perfect/tolerance/proxy/ai), reason, confidence, amountDiff, needsConfirmation, proxyInfo |
| `exceptions` | **异常记录表** | type(NO_INVOICE/NO_BANK_TXN/DUPLICATE_PAYMENT/AMOUNT_MISMATCH/SUSPICIOUS_PROXY), severity(high/medium/low), detail, suggestion, status |
| `reports` | **报告记录表** | batchId, name, filePath, type(auto_entry/explainable/exceptions/summary) |

---

## 五、核心业务流程（三级漏斗匹配引擎）

```
用户点击"开始核销"
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: 数据导入 (importService)                                │
│  • 银行流水 Excel → parseBankTransactions() → bank_transactions  │
│  • 发票 Excel    → parseInvoices()          → invoices           │
│  • 发票 PDF      → Python invoice_parser.py → invoices           │
│  • 付款人映射    → parsePayerMappings()     → payer_mappings     │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: 第一层 - 完美匹配 matchingService.executeRuleMatching() │
│                                                                   │
│  规则 A（Perfect Match）：                                        │
│    银行.payerName  == 发票.sellerName（归一化后）                 │
│    银行.amount     == 发票.amount                                 │
│    → 写入 match_results (matchType='perfect')                    │
│                                                                   │
│  规则 B（Tolerance Match，手续费容差）：                          │
│    银行.payerName  == 发票.sellerName                             │
│    0 < (发票.amount - 银行.amount) ≤ 20元                        │
│    → 写入 match_results (matchType='tolerance')                   │
│                                                                   │
│  规则 C（Proxy Match，映射表代付）：                              │
│    银行.amount == 发票.amount（或容差≤20）                        │
│    payer_mappings 中 personName==银行户名 &                      │
│                      companyName==发票销售方                     │
│    → 写入 match_results (matchType='proxy')                      │
└─────────────────────────────────────────────────────────────────┘
        │ 未匹配残余
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: 第二层 - AI 语义匹配 aiMatchingService.executeAIMatching│
│                                                                   │
│  触发条件：金额一致或差额≤20，但户名不一致                        │
│                                                                   │
│  流程：                                                           │
│  1. repairBrokenInvoices()                                        │
│     → 对金额为0或销售方未知的发票，用AI从PDF原文重新提取          │
│  2. 遍历未匹配银行流水 vs 未匹配发票                              │
│  3. 调用 DeepSeek API：                                           │
│     System: "你是银企核销助手，判断代付关系"                      │
│     User:   银行户名 + 发票销售方 + 映射表上下文                  │
│  4. AI 返回 JSON：{ match: true/false, reason: "...", confidence }│
│  5. 命中 → 写入 match_results (matchType='ai')                   │
└─────────────────────────────────────────────────────────────────┘
        │ 仍未匹配
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: 第三层 - 异常检测 exceptionService.detectExceptions()   │
│                                                                   │
│  detectNoInvoice()        → 有水无票（银行流水无对应发票）        │
│  detectNoBankTransaction() → 有票无水（发票无对应银行流水）       │
│  detectDuplicatePayments() → 重复支付（同付款人相近金额相近日期） │
│  detectAmountMismatch()    → 金额严重不符（差额 > 20元）          │
│                                                                   │
│  diagnoseExceptionsWithAI() → AI诊断每条异常，生成建议操作       │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: 报告生成 reportService.generateReports()               │
│                                                                   │
│  ① 自动入账凭证.xlsx                                             │
│     双行合并表头，包含所有成功匹配记录（perfect/tolerance/proxy/ai）│
│     字段：银行流水信息 + 发票信息 + 核销金额 + 差额               │
│                                                                   │
│  ② 可解释性报告.xlsx                                             │
│     matchType = tolerance / proxy / ai 的匹配记录                │
│     字段：关联序号 | AI推理链 | 证据链 | 置信度 | 状态            │
│                                                                   │
│  ③ 异常情况处理报告.xlsx                                         │
│     所有 exceptions 表记录                                        │
│     字段：风险等级 | 异常类型 | 银行流水详情 | AI诊断 | AI建议    │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 6: 归档 archiveService.archiveBatch()                     │
│                                                                   │
│  创建归档目录：工作目录/00归档/YYYYMMDD-N/                        │
│    ├── 银行流水/（移动原始银行流水文件）                           │
│    ├── 发票/（移动原始发票文件）                                   │
│    └── AI比对报告/（移动三份Excel报告）                           │
│  批次状态更新为 archived                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 六、PDF 发票解析流程

```
PDF 文件夹
    │
    ▼
invoiceParseService.batchParsePdfInvoices()
    │  调用 Python 子进程
    ▼
electron/python/invoice_parser.py (InvoiceParser 类)
    │
    ├── parse_single_invoice(file_path)
    │       ├── pdfplumber 打开 PDF
    │       ├── _extract_metadata()        # 从 PDF 元数据提取（最快）
    │       ├── _extract_buyer_seller_from_table()  # 从表格结构提取
    │       ├── _extract_amounts_from_table()       # 提取金额
    │       ├── _extract_buyer_seller_from_text()   # 从文本行提取（全电票格式）
    │       ├── _extract_amounts_from_text()        # 文本金额提取
    │       ├── _extract_sparse_format()            # 稀疏格式（纯数字排列）
    │       ├── _extract_invoice_number()           # 发票号码
    │       ├── _extract_invoice_date()             # 开票日期
    │       ├── _extract_invoice_type()             # 发票类型
    │       ├── _extract_item_from_table/text()     # 货物名称
    │       ├── _extract_chinese_total()            # 大写金额（校验）
    │       ├── _extract_remark()                   # 备注
    │       ├── _extract_issuer()                   # 开票人
    │       └── _derive_amounts()                   # 推算缺失金额
    │
    ├── batch_parse(folder_path)
    │       ├── 批次内去重（invoiceNumber + size + mtime）
    │       └── 逐张解析 → 返回 BatchParseResult
    │
    └── 结果返回给 TS 层 → importPdfInvoices() 写入数据库
            （跨批次去重：相同发票号不重复导入）

支持的发票格式：
  • 全电发票（格式A）：购/卖方同行 "购 名称：xxx 销 名称：yyy"
  • 标准增值税发票（格式B）：表格结构解析
  • 稀疏格式（格式C）：纯文本数字排列
  • PDF元数据格式（格式D）：从 PDF 属性提取

AI 修复兜底（repairBrokenInvoices）：
  • 对金额=0 或 sellerName=unknown 的发票
  • 读取 PDF 原始文本，发送给 DeepSeek API
  • AI 从自然语言中结构化提取发票信息
```

---

## 七、IPC 通信架构

```
渲染进程 (React)                    主进程 (Node.js/Electron)
─────────────────                   ─────────────────────────────
window.electron.xxx()
        │                                      │
        │  contextBridge.exposeInMainWorld      │
        │  preload.ts                          │
        ▼                                      ▼
ipcRenderer.invoke(channel, args) ──→ ipcMain.handle(channel, handler)
                                               │
                              handlers/reconciliation.ts
                              handlers/ai.ts
                              handlers/config.ts
                              handlers/database.ts
                              handlers/file.ts

IPC 通道分组（约50个）：
  db:*             数据库 CRUD
  config:*         应用配置读写
  file:*           文件操作（选择/扫描/导入/导出）
  ai:*             AI 配置与调用
  app:*            应用信息（版本/平台/打开外部链接）
  reconciliation:* 核销全部业务逻辑（最多，约35个通道）

进度推送机制（主进程 → 渲染进程）：
  ipcMain → webContents.send('reconciliation:progress', {stage, percentage, message})
  渲染进程监听 → 更新进度条 UI
```

---

## 八、工作目录结构（用户配置）

```
用户指定的工作目录（workspaceFolder）/
├── 00归档/                          # 已完成核销的历史存档
│   ├── 20260220-1/                  # 格式：YYYYMMDD-N
│   │   ├── 银行流水/
│   │   ├── 发票/
│   │   └── AI比对报告/
│   └── 20260221-1/
├── 01发票/                          # 待核销的发票文件（PDF/Excel）
│   ├── *.pdf
│   └── *.xlsx
└── 02银行流水/                      # 待核销的银行流水（Excel/CSV）
    └── *.xlsx
```

---

## 九、应用数据存储位置

| 数据类型 | 存储位置（macOS） |
|---------|-----------------|
| SQLite 数据库 | `~/Library/Application Support/electron-bank/database/app.db` |
| 应用配置 | `~/Library/Application Support/electron-bank/config.json` |
| AI 配置 | `~/Library/Application Support/electron-bank/ai-config.json` |
| API Key（加密） | `~/Library/Application Support/electron-bank/ai-keys.json` |
| 导入的文件 | `~/Library/Application Support/electron-bank/imports/` |
| 导出的文件 | `~/Library/Application Support/electron-bank/exports/` |

---

## 十、前端页面路由

| 路径 | 页面 | 功能 |
|------|------|------|
| `/` | Home | 首页，批次列表，快速开始核销入口 |
| `/reconciliation` | Reconciliation | 核销工作台：数据导入、执行核销、查看进度 |
| `/reconciliation/:id` | ReconciliationDetail | 核销结果详情：匹配明细、异常列表、确认操作 |
| `/reports` | Reports | 报告管理：查看/下载三类Excel报告 |
| `/payer-mappings` | PayerMappings | 付款人映射管理：维护个人-公司代付关系 |
| `/settings` | Settings | 设置：工作目录配置、AI 服务配置 |

---

## 十一、AI 服务配置

```typescript
// 支持的 AI 提供商
provider: 'deepseek' | 'custom'

// 默认端点
DEFAULT_DEEPSEEK_ENDPOINT = 'https://api.deepseek.com'

// 默认模型
model: 'deepseek-chat'

// 请求特性
- JSON 强制输出模式（response_format: { type: 'json_object' }）
- 指数退避重试（最多3次，429限流时自动等待）
- 60秒超时
- Token 用量统计（写入 reconciliation_batches.tokensUsed）

// AI 在核销中的四种用途：
1. AI 语义匹配（aiMatchingService）    → 代付关系识别
2. 异常 AI 诊断（exceptionService）    → 异常原因分析与建议
3. PDF 发票 AI 修复（invoiceParseService）→ 损坏发票文本提取
4. AI 关系抽取（reconciliation IPC）   → 从备注文本预构建关系表
```

---

## 十二、服务依赖关系图

```
reconciliationService（编排中枢）
    ├── importService         → parseService
    │                         → invoiceParseService → Python(pdfplumber)
    │                                              → aiService（修复）
    ├── matchingService       → parseService（normalizeName）
    │                         → payer_mappings 表（代付查表）
    ├── aiMatchingService     → aiService（DeepSeek API）
    │                         → invoiceParseService（repairBrokenInvoices）
    ├── exceptionService      → aiService（诊断异常）
    ├── reportService         → xlsx 库（Excel生成）
    ├── archiveService        → folderService（目录管理）
    │                         → reportService（归档报告路径）
    └── taskService           → （中断标志 isStopped()）

mappingService（独立，供 ReconciliationDetail 和 PayerMappings 使用）
aiService（单例，全局共享）
folderService（独立，工作目录初始化与验证）
```

---

## 十三、数据归一化处理

在匹配前，对户名和金额进行以下清洗：

```typescript
// normalizeName()
'有限公司' → 保留
'(中国)'、'（中国）' → 去除
全角括号 → 转半角
多余空格 → 去除

// normalizeAmount()
货币符号（¥/￥/$）→ 去除
千分位逗号 → 去除
括号负数 (1000) → -1000
字符串 → parseFloat

// isLikelyPersonName()（判断是否为个人而非公司）
- 长度 ≤ 4 个字符
- 不含"公司/企业/集团/商行/合作社"等关键词
- 包含常见中文姓（李/王/张/刘...）
```

---

## 十四、已知问题与技术债

1. **原始基础表冗余**：`reconciliation_records` / `bills` / `transactions` 这三张表是早期架构遗留，现在核销流程全部使用 `reconciliation_batches` 那套表体系，存在冗余。

2. **Python 依赖管理**：Python 虚拟环境（`.venv`）内置在项目目录，打包后需要 embed Python 运行时，增加安装包体积和打包复杂度。

3. **AI 匹配置信度**：当前 AI 匹配的 confidence 字段由 AI 自我评估，缺乏外部校验机制。

4. **缺乏自动测试**：无单元测试覆盖，手动测试依赖 `test-data/` 目录中的样本数据。

5. **账号唯一性**：付款人匹配依赖 `personName`，未充分利用 `accountSuffix`（银行账号尾号）进行精准去重，存在同名不同人的风险。

---

*本文档由 AI 自动生成，基于 2026-02-22 代码快照。*
