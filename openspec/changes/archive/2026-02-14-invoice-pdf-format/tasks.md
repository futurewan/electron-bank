## 1. 数据库 Schema 扩展

- [x] 1.1 在 `electron/database/schema.ts` 的 `invoices` 表中新增 9 个 nullable 字段：buyerName、buyerTaxId、sellerTaxId、taxAmount、taxRate、invoiceType、itemName、parseSource、sourceFilePath
- [x] 1.2 运行 `drizzle-kit push` 验证 Schema 变更可正常应用，确认已有数据不受影响
- [x] 1.3 更新 `NewInvoice` 类型导出，确保新字段在 TypeScript 类型中可用

## 2. PDF 解析引擎核心(invoiceParseService.ts)

- [x] 2.1 重构 `parseSingleInvoicePdf()`：确保元数据提取和文字层提取的双层策略正确工作，返回完整的 `InvoiceInfo` 结构体
- [x] 2.2 完善 `extractFieldsFromText()` 正则规则：覆盖主流发票版式（增值税专用/普通发票、电子发票），确保购买方/销售方名称、税号、金额、税率等字段的提取准确率
- [x] 2.3 实现批次内去重逻辑：在 `batchParsePdfInvoices()` 中增加去重步骤，以 invoiceNumber 为优先去重键，fallback 到 sellerName+amount+invoiceDate 组合键
- [x] 2.4 扩展 `BatchParseResult` 返回结构：新增 `duplicateCount` 和 `duplicates` 字段（含 fileName、invoiceNumber、reason）
- [x] 2.5 修改 `exportInvoicesToExcel()`：导出时排除被去重跳过的发票，Excel 列头 `销售方名称` 与 parseService 的 INVOICE_FIELD_MAPPINGS 对齐

## 3. 导入服务扩展（importService.ts）

- [x] 3.1 新增 `importPdfInvoices(batchId, invoices: InvoiceInfo[])` 函数：将 PDF 解析结果直接写入 `invoices` 表，填充扩展字段
- [x] 3.2 实现跨批次去重查询：入库前以 invoiceNumber 查询数据库，invoiceNumber 为空时以 sellerName+amount+invoiceDate 组合查询
- [x] 3.3 返回导入摘要：`{ imported: number, skippedDuplicates: Array<{ invoiceNumber, fileName, reason }> }`
- [x] 3.4 保留原有 `importInvoices(batchId, filePath)` 接口不变，确保 Excel 导入路径向后兼容

## 4. IPC 通道与处理器

- [x] 4.1 确认 `electron/ipc/channels.ts` 中 RECONCILIATION_CHANNELS 的 3 个新通道已定义：SCAN_PDF_FOLDER、PARSE_PDF_INVOICES、EXPORT_INVOICES_EXCEL
- [x] 4.2 重构 `electron/ipc/handlers/reconciliation.ts` 中的 `handleExportInvoicesExcel` 处理器：调用 batchParsePdfInvoices → 批次内去重 → exportInvoicesToExcel → 返回含去重统计的结果
- [x] 4.3 新增 `handleImportPdfInvoices` 处理器：调用 importPdfInvoices 执行跨批次去重和入库，通过 IPC progress 事件报告进度
- [x] 4.4 更新 `electron/preload.ts`：暴露 `importPdfInvoices` API 到渲染进程

## 5. 前端对账流程适配（Reconciliation/index.tsx）

- [x] 5.1 修改 `scanFolders()` 实现 PDF 优先策略：Excel 为空时自动扫描 PDF → 解析 → 生成 Excel → 重新扫描
- [x] 5.2 添加 `scanningRef` 防止重复扫描：使用 useRef 守卫确保 scanFolders 不会被并发调用（修复"弹窗弹出两次"问题）
- [x] 5.3 展示 PDF 解析进度：使用 `message.open({ type: 'loading', key: 'pdf_parsing' })` 提示"检测到 N 个 PDF 发票，正在智能解析..."
- [x] 5.4 修改 `executeBatchCreation()` 支持 PDF 导入路径：当输入为 PDF 解析结果时，调用 `importPdfInvoices` 而非 `importInvoices`
- [x] 5.5 展示去重结果：解析/导入完成后，若 duplicateCount > 0，在 message 中提示"成功 N 张 / 重复跳过 M 张 / 失败 K 张"

## 6. 前端对账详情页适配（ReconciliationDetail/index.tsx）

- [x] 6.1 更新"导入文件"区域：当发票来源为 PDF 时，展示 PDF 文件列表（使用 🧾 图标前缀）
- [x] 6.2 标记自动生成的 Excel 文件：在文件列表中为系统自动生成的汇总 Excel 添加 `[自动生成]` 标注

## 7. 集成测试与验证

- [x] 7.1 编写端到端测试脚本：验证 PDF 解析 → 批次内去重 → Excel 导出 → 跨批次去重 → 入库 完整链路
- [x] 7.2 测试向后兼容：确认 Excel/CSV 导入路径无回归
- [x] 7.3 测试边界场景：空文件夹、图片型 PDF（无文字层）、超大批量（50+ PDF）、发票号码提取失败时的组合键去重
- [x] 7.4 在应用中执行完整对账流程：PDF 发票 → 自动解析 → 对账匹配 → 生成报告，验证数据一致性
