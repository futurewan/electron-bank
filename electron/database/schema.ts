/**
 * 数据库 Schema 定义
 * 使用 Drizzle ORM 定义 SQLite 表结构
 */
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * 对账记录表
 * 存储每次对账的主记录
 */
export const reconciliationRecords = sqliteTable('reconciliation_records', {
  id: text('id').primaryKey(),
  billNumber: text('bill_number').notNull(),
  amount: real('amount').notNull(),
  status: text('status', { enum: ['pending', 'matched', 'unmatched'] }).notNull().default('pending'),
  aiAnalysis: text('ai_analysis'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  billNumberIdx: index('idx_reconciliation_bill_number').on(table.billNumber),
  statusIdx: index('idx_reconciliation_status').on(table.status),
  createdAtIdx: index('idx_reconciliation_created_at').on(table.createdAt),
}))

/**
 * 账单数据表
 * 存储导入的账单明细
 */
export const bills = sqliteTable('bills', {
  id: text('id').primaryKey(),
  recordId: text('record_id').references(() => reconciliationRecords.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['income', 'expense'] }).notNull(),
  amount: real('amount').notNull(),
  date: integer('date', { mode: 'timestamp' }).notNull(),
  description: text('description'),
  source: text('source'),
  category: text('category'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  recordIdIdx: index('idx_bills_record_id').on(table.recordId),
  dateIdx: index('idx_bills_date').on(table.date),
  typeIdx: index('idx_bills_type').on(table.type),
}))

/**
 * 交易明细表
 * 存储具体的交易流水
 */
export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  billId: text('bill_id').references(() => bills.id, { onDelete: 'cascade' }),
  amount: real('amount').notNull(),
  transactionDate: integer('transaction_date', { mode: 'timestamp' }).notNull(),
  counterparty: text('counterparty'),
  remark: text('remark'),
  transactionNo: text('transaction_no'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  billIdIdx: index('idx_transactions_bill_id').on(table.billId),
  transactionDateIdx: index('idx_transactions_date').on(table.transactionDate),
}))

/**
 * AI 对话历史表
 * 存储与 AI 的对话记录
 */
export const aiConversations = sqliteTable('ai_conversations', {
  id: text('id').primaryKey(),
  recordId: text('record_id').references(() => reconciliationRecords.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  model: text('model'),
  tokenCount: integer('token_count'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  recordIdIdx: index('idx_ai_conversations_record_id').on(table.recordId),
  createdAtIdx: index('idx_ai_conversations_created_at').on(table.createdAt),
}))

// 导出类型推断
export type ReconciliationRecord = typeof reconciliationRecords.$inferSelect
export type NewReconciliationRecord = typeof reconciliationRecords.$inferInsert
export type Bill = typeof bills.$inferSelect
export type NewBill = typeof bills.$inferInsert
export type Transaction = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert
export type AIConversation = typeof aiConversations.$inferSelect
export type NewAIConversation = typeof aiConversations.$inferInsert

// ============================================
// 银企核销相关表
// ============================================

/**
 * 核销批次表
 * 每次核销任务创建一个批次
 */
export const reconciliationBatches = sqliteTable('reconciliation_batches', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status', {
    enum: ['pending', 'matching', 'completed', 'failed']
  }).notNull().default('pending'),
  totalBankCount: integer('total_bank_count').default(0),
  totalInvoiceCount: integer('total_invoice_count').default(0),
  matchedCount: integer('matched_count').default(0),
  unmatchedCount: integer('unmatched_count').default(0),
  exceptionCount: integer('exception_count').default(0),
  tokensUsed: integer('tokens_used').default(0),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
}, (table) => ({
  statusIdx: index('idx_batch_status').on(table.status),
  createdAtIdx: index('idx_batch_created_at').on(table.createdAt),
}))

/**
 * 银行流水表
 */
export const bankTransactions = sqliteTable('bank_transactions', {
  id: text('id').primaryKey(),
  batchId: text('batch_id').references(() => reconciliationBatches.id, { onDelete: 'cascade' }),
  transactionDate: integer('transaction_date', { mode: 'timestamp' }),
  payerName: text('payer_name').notNull(),
  payerAccount: text('payer_account'),
  amount: real('amount').notNull(),
  remark: text('remark'),
  transactionNo: text('transaction_no'),
  status: text('status', {
    enum: ['pending', 'matched', 'unmatched', 'exception']
  }).notNull().default('pending'),
  matchId: text('match_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  batchIdIdx: index('idx_bank_batch_id').on(table.batchId),
  statusIdx: index('idx_bank_status').on(table.status),
  payerNameIdx: index('idx_bank_payer_name').on(table.payerName),
  amountIdx: index('idx_bank_amount').on(table.amount),
}))

/**
 * 发票数据表
 */
export const invoices = sqliteTable('invoices', {
  id: text('id').primaryKey(),
  batchId: text('batch_id').references(() => reconciliationBatches.id, { onDelete: 'cascade' }),
  invoiceCode: text('invoice_code'),
  invoiceNumber: text('invoice_number'),
  sellerName: text('seller_name').notNull(),
  amount: real('amount').notNull(),
  invoiceDate: integer('invoice_date', { mode: 'timestamp' }),
  status: text('status', {
    enum: ['pending', 'matched', 'unmatched', 'exception']
  }).notNull().default('pending'),
  matchId: text('match_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),

  // ---- PDF 解析扩展字段（全部 nullable，不影响已有数据）----
  buyerName: text('buyer_name'),
  buyerTaxId: text('buyer_tax_id'),
  sellerTaxId: text('seller_tax_id'),
  taxAmount: real('tax_amount'),
  taxRate: text('tax_rate'),
  invoiceType: text('invoice_type'),
  itemName: text('item_name'),
  parseSource: text('parse_source'),       // metadata / textlayer / both / none
  sourceFilePath: text('source_file_path'),
}, (table) => ({
  batchIdIdx: index('idx_invoice_batch_id').on(table.batchId),
  statusIdx: index('idx_invoice_status').on(table.status),
  sellerNameIdx: index('idx_invoice_seller_name').on(table.sellerName),
  amountIdx: index('idx_invoice_amount').on(table.amount),
  invoiceNumberIdx: index('idx_invoice_number').on(table.invoiceNumber),
}))

/**
 * 付款人对应关系表
 */
export const payerMappings = sqliteTable('payer_mappings', {
  id: text('id').primaryKey(),
  personName: text('person_name').notNull(),
  companyName: text('company_name').notNull(),
  accountSuffix: text('account_suffix'),
  remark: text('remark'),
  source: text('source', { enum: ['manual', 'ai_extracted', 'imported', 'quick_add'] }).default('manual'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  personNameIdx: index('idx_mapping_person_name').on(table.personName),
  companyNameIdx: index('idx_mapping_company_name').on(table.companyName),
}))

/**
 * 匹配结果表
 */
export const matchResults = sqliteTable('match_results', {
  id: text('id').primaryKey(),
  batchId: text('batch_id').references(() => reconciliationBatches.id, { onDelete: 'cascade' }),
  bankId: text('bank_id').references(() => bankTransactions.id, { onDelete: 'cascade' }),
  invoiceId: text('invoice_id').references(() => invoices.id, { onDelete: 'cascade' }),
  matchType: text('match_type', {
    enum: ['perfect', 'tolerance', 'proxy', 'ai']
  }).notNull(),
  reason: text('reason'),
  confidence: real('confidence'),
  amountDiff: real('amount_diff'),
  needsConfirmation: integer('needs_confirmation', { mode: 'boolean' }).default(false),
  confirmed: integer('confirmed', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  batchIdIdx: index('idx_match_batch_id').on(table.batchId),
  matchTypeIdx: index('idx_match_type').on(table.matchType),
}))

/**
 * 异常记录表
 */
export const exceptions = sqliteTable('exceptions', {
  id: text('id').primaryKey(),
  batchId: text('batch_id').references(() => reconciliationBatches.id, { onDelete: 'cascade' }),
  type: text('type', {
    enum: ['NO_INVOICE', 'NO_BANK_TXN', 'DUPLICATE_PAYMENT', 'AMOUNT_MISMATCH', 'SUSPICIOUS_PROXY']
  }).notNull(),
  severity: text('severity', { enum: ['high', 'medium', 'low'] }).notNull(),
  relatedBankId: text('related_bank_id'),
  relatedInvoiceId: text('related_invoice_id'),
  detail: text('detail'),  // JSON 详情
  suggestion: text('suggestion'),
  status: text('status', { enum: ['pending', 'resolved', 'ignored'] }).default('pending'),
  resolution: text('resolution'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
}, (table) => ({
  batchIdIdx: index('idx_exception_batch_id').on(table.batchId),
  typeIdx: index('idx_exception_type').on(table.type),
  statusIdx: index('idx_exception_status').on(table.status),
}))

/**
 * 报告记录表
 */
export const reports = sqliteTable('reports', {
  id: text('id').primaryKey(),
  batchId: text('batch_id').references(() => reconciliationBatches.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  filePath: text('file_path').notNull(),
  type: text('type').notNull(), // 'auto_entry', 'explainable', 'exceptions', 'summary'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  batchIdIdx: index('idx_report_batch_id').on(table.batchId),
  createdAtIdx: index('idx_report_created_at').on(table.createdAt),
}))

// 核销相关类型导出
export type ReconciliationBatch = typeof reconciliationBatches.$inferSelect
export type NewReconciliationBatch = typeof reconciliationBatches.$inferInsert
export type BankTransaction = typeof bankTransactions.$inferSelect
export type NewBankTransaction = typeof bankTransactions.$inferInsert
export type Invoice = typeof invoices.$inferSelect
export type NewInvoice = typeof invoices.$inferInsert
export type PayerMapping = typeof payerMappings.$inferSelect
export type NewPayerMapping = typeof payerMappings.$inferInsert
export type MatchResult = typeof matchResults.$inferSelect
export type NewMatchResult = typeof matchResults.$inferInsert
export type Exception = typeof exceptions.$inferSelect
export type NewException = typeof exceptions.$inferInsert
export type Report = typeof reports.$inferSelect
export type NewReport = typeof reports.$inferInsert


