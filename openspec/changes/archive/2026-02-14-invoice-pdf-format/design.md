## Context

当前系统的发票导入链路为：

```
发票文件夹 → scanFolder() 扫描 Excel/CSV → parseInvoices() 列名映射解析 → importInvoices() 入库 → 对账匹配
```

**核心模块现状：**

| 模块 | 文件 | 职责 |
|------|------|------|
| 解析服务 | `parseService.ts` | `parseInvoices()` 按 `INVOICE_FIELD_MAPPINGS` 映射 Excel 列名提取 5 个字段 |
| 导入服务 | `importService.ts` | `importInvoices()` 调用 parseInvoices → 批量写入 `invoices` 表 |
| 数据库 | `schema.ts` | `invoices` 表仅 5 个业务字段：invoiceCode, invoiceNumber, sellerName, amount, invoiceDate |
| 前端 | `Reconciliation/index.tsx` | `scanFolders()` 扫描文件夹 → 展示文件列表 → 创建批次并导入 |

**约束：**
- `pdf-parse` (v2) 已安装，原型代码 `invoiceParseService.ts` 已验证可行
- `invoices` 表已有大量对账数据，迁移必须非破坏性
- 前端同时支持 "从首页一键开始" 和 "从对账管理页手动创建" 两条入口

## Goals / Non-Goals

**Goals:**
- 以 PDF 文件夹作为发票的一等输入格式，用户无需手动整理 Excel
- 在批量解析环节实现批次内去重和跨批次去重，防止同一张发票重复入库
- 解析完成后自动在原目录生成一份 Excel 汇总文件，供用户审计核验
- 数据库 `invoices` 表扩展字段，存储 PDF 解析出的更丰富的发票信息
- 保留 Excel/CSV 作为后备导入路径，实现向后兼容

**Non-Goals:**
- 不在本次设计中引入 OCR 或 AI 视觉识别（仅依赖 PDF 文字层和元数据）
- 不对银行流水的导入流程做任何改动
- 不改变对账匹配算法本身；匹配引擎仍然按 sellerName + amount 进行匹配
- 不引入发票真伪验证（税务局接口联查等）

## Decisions

### Decision 1：PDF 解析策略 — 双层提取

**选择：元数据优先 + 文字层正则兜底**

很多电子发票 PDF 的 `Custom` 元数据中直接嵌入了结构化字段（InvoiceNumber, TotalAmount 等），提取零成本且精确。当元数据不完整时，使用 `getText()` API 提取全文，再用正则从文本中提取各字段。

**备选方案：**
- 仅用正则：简单，但会丢失元数据中精确的字段值
- 仅用元数据：很多 PDF 没有自定义元数据，覆盖率不够
- 接入 OCR/AI：效果最好，但引入外部依赖和成本，不适合本阶段

**Why this approach：** 两层叠加可以相互补充，代码复杂度可控，不引入外部服务依赖。

### Decision 2：去重键设计

**选择：发票号码优先，组合键兜底**

```
去重键 = invoiceNumber (if not null)
       | sha256(sellerName + amount + invoiceDate) (fallback)
```

**理由：**
- 发票号码是国家税务局分配的唯一标识，天然适合做去重键
- 当 PDF 解析无法提取到发票号码时（图片型 PDF、格式不规则），回退到业务字段组合
- 组合键中包含销售方 + 金额 + 日期，在实际业务中具有较高的区分度
- 不使用文件名/MD5 去重，因为同一张发票可能以不同文件名存在

**备选方案：**
- 仅用文件 MD5：无法识别"不同文件名但内容相同"或"内容略有差异但发票相同"的情况
- 仅用发票号码：无号码时无法去重

### Decision 3：去重执行时机 — 两阶段去重

**选择：解析后去重（批次内）+ 入库前去重（跨批次）**

```
阶段 1（批次内去重）:
  invoiceParseService.batchParsePdfInvoices()
    → 解析完所有 PDF
    → 按去重键检测重复
    → 仅保留首次出现的发票
    → 返回 { invoices, duplicates, errors }

阶段 2（跨批次去重）:
  importService.importInvoices()
    → 入库前查询 DB: SELECT invoiceNumber FROM invoices WHERE invoiceNumber IN (...)
    → 跳过已存在的记录
    → 返回 { imported, skippedDuplicates }
```

**理由：** 两阶段职责清晰。第一阶段在内存中完成，不产生 DB 开销；第二阶段精确查询，避免跨批次重复。

### Decision 4：数据库迁移策略 — 增量字段 + 非破坏性

**选择：在 `invoices` 表上 ALTER TABLE ADD COLUMN**

新增字段（全部 nullable）：

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `buyerName` | text | 购买方名称 |
| `buyerTaxId` | text | 购买方税号 |
| `sellerTaxId` | text | 销售方税号 |
| `taxAmount` | real | 税额 |
| `taxRate` | text | 税率 |
| `invoiceType` | text | 发票类型 |
| `itemName` | text | 项目名称 |
| `parseSource` | text | 解析来源 (metadata/textlayer/both) |
| `sourceFilePath` | text | 源 PDF 文件路径 |

**理由：**
- Drizzle ORM Push 可自动执行 `ALTER TABLE`
- 全部 nullable 确保已有数据不受影响
- 无需数据迁移脚本

**备选方案：**
- 新建 `invoice_details` 表：关联查询复杂，对匹配引擎侵入性大
- 废弃旧表重建：破坏性太大

### Decision 5：导入链路改造 — PDF 优先策略

**选择：扫描时 PDF 优先，Excel 兼容**

```
scanFolders(invoicePath)
  ├── scanFolder(invoicePath)           → 找 Excel/CSV
  ├── if Excel 存在 → 走原有 parseInvoices 链路
  │
  └── if Excel 为空
       ├── scanPdfFolder(invoicePath)   → 找 PDF 文件
       ├── if PDF 存在
       │    ├── batchParsePdfInvoices() → 解析 + 批次内去重
       │    ├── exportInvoicesToExcel() → 生成审计用 Excel
       │    └── 用解析结果 直接入库（不经过 parseInvoices()）
       │
       └── if 都为空 → 提示"发票文件夹为空"
```

**理由：**
- Excel 优先保证向后兼容：已经有 Excel 的用户流程不变
- PDF 路径绕过 `parseInvoices()`，直接调用新写的 `importPdfInvoices()` 入库
- 生成的 Excel 仅作为审计产物，不参与导入链路

### Decision 6：进度反馈与去重结果展示

**选择：IPC 进度事件 + 解析结果摘要**

```typescript
// 进度事件
{ type: 'pdf_parse', current: 3, total: 10, fileName: 'inv_003.pdf' }

// 最终结果
{
  success: true,
  totalFiles: 10,
  successCount: 8,
  duplicateCount: 1,     // 新增
  duplicates: [          // 新增：被去重的详情
    { fileName: 'inv_005.pdf', invoiceNumber: '12345', reason: '批次内重复' }
  ],
  failCount: 1,
  errors: [...]
}
```

前端展示：
- 解析中：Loading + "正在解析第 X/N 张发票..."
- 完成后：成功 8 张 / 重复跳过 1 张 / 失败 1 张
- 如有重复或失败，可展开查看详情列表

## Risks / Trade-offs

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| PDF 文字层缺失 | 提取不到任何字段，发票形同废纸 | `parseSource = 'none'` 时标记为解析失败，前端提示用户"该发票为图片型 PDF，建议手动录入" |
| 正则覆盖率不足 | 部分省份/行业的发票版式未命中 | 预留正则规则扩展点；长期方案接入 OCR/AI |
| 组合键去重误判 | 不同发票恰好相同销售方+金额+日期 | 概率极低（实际业务中金额精确到分）；日志记录所有去重决策，方便人工核查 |
| `pdf-parse` v2 API 稳定性 | 库处于活跃开发期，API 可能变化 | `invoiceParseService.ts` 封装为独立模块，隔离变化影响 |
| 大量 PDF 文件解析性能 | 100+ PDF 可能需要较长时间 | 逐个串行解析 + IPC 进度反馈，避免内存爆炸；未来可考虑 Worker 线程并行 |
