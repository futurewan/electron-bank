# Invoice Import Specification

## Purpose
Define how invoice data is imported into the system, including source formats, parsing logic, deduplication rules, and database storage.

## Requirements

### Requirement: 发票数据导入入库
系统 SHALL 支持将发票数据导入到 `invoices` 表中。导入来源从"仅 Excel/CSV"扩展为"Excel/CSV 或 PDF 解析结果"。当输入为 PDF 解析结果时，系统 SHALL 直接使用 `InvoiceInfo` 结构体入库，无需经过 `parseInvoices()` 列名映射。

#### Scenario: 从 PDF 解析结果导入
- **WHEN** 调用 `importPdfInvoices(batchId, invoices: InvoiceInfo[])` 传入 PDF 解析后的结构化数据
- **THEN** 系统 SHALL 将数据写入 `invoices` 表，并填充扩展字段（buyerName、sellerTaxId、taxAmount、taxRate、invoiceType、itemName、parseSource、sourceFilePath）

#### Scenario: 从 Excel 导入（向后兼容）
- **WHEN** 调用原有 `importInvoices(batchId, filePath)` 传入 Excel 文件路径
- **THEN** 系统 SHALL 继续使用 `parseInvoices()` 列名映射解析，行为与变更前完全一致

#### Scenario: 跨批次去重校验
- **WHEN** 以 PDF 模式导入时，待导入列表中有一张发票号码 "12345" 已存在于数据库 `invoices` 表中（任意批次）
- **THEN** 系统 SHALL 跳过该发票的入库操作，并在返回结果中记录 `skippedDuplicates` 信息（含 invoiceNumber 和 reason: '跨批次重复'）

#### Scenario: 跨批次去重 — 发票号码为空
- **WHEN** 待导入发票的 invoiceNumber 为 null
- **THEN** 系统 SHALL 使用 `sellerName + amount + invoiceDate` 组合查询数据库进行去重

### Requirement: 数据库 Schema 扩展
`invoices` 表 SHALL 新增以下可选字段以存储 PDF 解析出的丰富信息。所有新增字段 SHALL 为 nullable，不影响已有数据。

#### Scenario: Drizzle Schema 定义新增字段
- **WHEN** 系统启动并执行 drizzle push
- **THEN** `invoices` 表 SHALL 包含以下新字段：buyerName (text)、buyerTaxId (text)、sellerTaxId (text)、taxAmount (real)、taxRate (text)、invoiceType (text)、itemName (text)、parseSource (text)、sourceFilePath (text)

#### Scenario: 已有数据不受影响
- **WHEN** 系统升级后查询历史记录
- **THEN** 历史数据的新字段 SHALL 全部为 null，其他字段值不变

### Requirement: 发票导入进度回调
系统 SHALL 在 PDF 发票导入过程中通过 IPC 向渲染进程报告进度，包括当前处理的文件和总体进度。

#### Scenario: 通过 IPC 报告解析进度
- **WHEN** 正在批量解析发票文件夹中的第 5/20 个文件
- **THEN** 系统 SHALL 通过 `reconciliation:progress` IPC 事件发送 `{ type: 'pdf_parse', current: 5, total: 20, fileName: 'inv_005.pdf' }`

#### Scenario: 报告最终结果
- **WHEN** 批量解析和导入全部完成
- **THEN** 系统 SHALL 发送进度事件 `{ stage: 'done', percentage: 100 }` 并返回包含 successCount、duplicateCount、failCount 的结果摘要
