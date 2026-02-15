/**
 * 数据库连接管理
 * 使用 better-sqlite3 + Drizzle ORM
 */
import Database from 'better-sqlite3'
import { BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import * as schema from './schema'

// 数据库单例
let db: BetterSQLite3Database<typeof schema> | null = null
let sqliteDb: Database.Database | null = null

/**
 * 获取数据库目录路径
 */
function getDatabaseDir(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'database')
}

/**
 * 获取数据库文件路径
 */
function getDatabasePath(): string {
  return path.join(getDatabaseDir(), 'app.db')
}

/**
 * 确保目录存在
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

/**
 * 初始化数据库表
 * 创建所有表（如果不存在）
 */
function initializeTables(sqlite: Database.Database): void {
  // 对账记录表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS reconciliation_records (
      id TEXT PRIMARY KEY,
      bill_number TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      ai_analysis TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  // 账单表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS bills (
      id TEXT PRIMARY KEY,
      record_id TEXT REFERENCES reconciliation_records(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      date INTEGER NOT NULL,
      description TEXT,
      source TEXT,
      category TEXT,
      created_at INTEGER NOT NULL
    )
  `)

  // 交易明细表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      bill_id TEXT REFERENCES bills(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      transaction_date INTEGER NOT NULL,
      counterparty TEXT,
      remark TEXT,
      transaction_no TEXT,
      created_at INTEGER NOT NULL
    )
  `)

  // AI 对话历史表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY,
      record_id TEXT REFERENCES reconciliation_records(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model TEXT,
      token_count INTEGER,
      created_at INTEGER NOT NULL
    )
  `)

  // ============================================
  // 银企核销相关表
  // ============================================

  // 核销批次表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS reconciliation_batches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      total_bank_count INTEGER DEFAULT 0,
      total_invoice_count INTEGER DEFAULT 0,
      matched_count INTEGER DEFAULT 0,
      unmatched_count INTEGER DEFAULT 0,
      exception_count INTEGER DEFAULT 0,
      tokens_used INTEGER DEFAULT 0,

      created_at INTEGER NOT NULL,
      completed_at INTEGER
    )
  `)

  // 银行流水表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS bank_transactions (
      id TEXT PRIMARY KEY,
      batch_id TEXT REFERENCES reconciliation_batches(id) ON DELETE CASCADE,
      transaction_date INTEGER,
      payer_name TEXT NOT NULL,
      payer_account TEXT,
      amount REAL NOT NULL,
      remark TEXT,
      transaction_no TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      match_id TEXT,
      created_at INTEGER NOT NULL
    )
  `)

  // 发票数据表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      batch_id TEXT REFERENCES reconciliation_batches(id) ON DELETE CASCADE,
      invoice_code TEXT,
      invoice_number TEXT,
      seller_name TEXT NOT NULL,
      amount REAL NOT NULL,
      invoice_date INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      match_id TEXT,
      created_at INTEGER NOT NULL
    )
  `)

  // 付款人对应关系表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS payer_mappings (
      id TEXT PRIMARY KEY,
      person_name TEXT NOT NULL,
      company_name TEXT NOT NULL,
      account_suffix TEXT,
      remark TEXT,
      source TEXT DEFAULT 'manual',
      created_at INTEGER NOT NULL
    )
  `)

  // 匹配结果表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS match_results (
      id TEXT PRIMARY KEY,
      batch_id TEXT REFERENCES reconciliation_batches(id) ON DELETE CASCADE,
      bank_id TEXT REFERENCES bank_transactions(id) ON DELETE CASCADE,
      invoice_id TEXT REFERENCES invoices(id) ON DELETE CASCADE,
      match_type TEXT NOT NULL,
      reason TEXT,
      confidence REAL,
      amount_diff REAL,
      needs_confirmation INTEGER DEFAULT 0,
      confirmed INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `)

  // 异常记录表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS exceptions (
      id TEXT PRIMARY KEY,
      batch_id TEXT REFERENCES reconciliation_batches(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      related_bank_id TEXT,
      related_invoice_id TEXT,
      detail TEXT,
      suggestion TEXT,
      status TEXT DEFAULT 'pending',
      resolution TEXT,
      created_at INTEGER NOT NULL,
      resolved_at INTEGER
    )
  `)

  // 报告记录表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      batch_id TEXT REFERENCES reconciliation_batches(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `)

  // 补丁：自动检查并添加缺失的列 (简单的自动迁移)
  try {
    // 1. reconciliation_batches 表迁移
    const batchTableInfo = sqlite.prepare('PRAGMA table_info(reconciliation_batches)').all() as any[]
    const batchColumns = batchTableInfo.map(col => col.name)

    // 需要补充的统计列
    const missingBatchColumns = [
      { name: 'matched_count', type: 'INTEGER DEFAULT 0' },
      { name: 'unmatched_count', type: 'INTEGER DEFAULT 0' },
      { name: 'exception_count', type: 'INTEGER DEFAULT 0' }
    ]

    for (const col of missingBatchColumns) {
      if (!batchColumns.includes(col.name)) {
        console.log(`[Database] 迁移: 向 reconciliation_batches 表添加 ${col.name} 列`)
        sqlite.exec(`ALTER TABLE reconciliation_batches ADD COLUMN ${col.name} ${col.type}`)
      }
    }

    // 2. invoices 表迁移 (PDF 解析字段)
    const invoiceTableInfo = sqlite.prepare('PRAGMA table_info(invoices)').all() as any[]
    const invoiceColumns = invoiceTableInfo.map(col => col.name)

    const missingInvoiceColumns = [
      { name: 'buyer_name', type: 'TEXT' },
      { name: 'buyer_tax_id', type: 'TEXT' },
      { name: 'seller_tax_id', type: 'TEXT' },
      { name: 'tax_amount', type: 'REAL' },
      { name: 'tax_rate', type: 'TEXT' },
      { name: 'invoice_type', type: 'TEXT' },
      { name: 'item_name', type: 'TEXT' },
      { name: 'parse_source', type: 'TEXT' },
      { name: 'source_file_path', type: 'TEXT' }
    ]

    for (const col of missingInvoiceColumns) {
      if (!invoiceColumns.includes(col.name)) {
        console.log(`[Database] 迁移: 向 invoices 表添加 ${col.name} 列`)
        sqlite.exec(`ALTER TABLE invoices ADD COLUMN ${col.name} ${col.type}`)
      }
    }

  } catch (err) {
    console.error('[Database] 自动迁移失败:', err)
  }

  // 创建索引
  sqlite.exec(`
    -- 原有表索引
    CREATE INDEX IF NOT EXISTS idx_reconciliation_bill_number ON reconciliation_records(bill_number);
    CREATE INDEX IF NOT EXISTS idx_reconciliation_status ON reconciliation_records(status);
    CREATE INDEX IF NOT EXISTS idx_reconciliation_created_at ON reconciliation_records(created_at);
    CREATE INDEX IF NOT EXISTS idx_bills_record_id ON bills(record_id);
    CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(date);
    CREATE INDEX IF NOT EXISTS idx_bills_type ON bills(type);
    CREATE INDEX IF NOT EXISTS idx_transactions_bill_id ON transactions(bill_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_ai_conversations_record_id ON ai_conversations(record_id);
    CREATE INDEX IF NOT EXISTS idx_ai_conversations_created_at ON ai_conversations(created_at);
    
    -- 核销批次索引
    CREATE INDEX IF NOT EXISTS idx_batch_status ON reconciliation_batches(status);
    CREATE INDEX IF NOT EXISTS idx_batch_created_at ON reconciliation_batches(created_at);
    
    -- 银行流水索引
    CREATE INDEX IF NOT EXISTS idx_bank_batch_id ON bank_transactions(batch_id);
    CREATE INDEX IF NOT EXISTS idx_bank_status ON bank_transactions(status);
    CREATE INDEX IF NOT EXISTS idx_bank_payer_name ON bank_transactions(payer_name);
    CREATE INDEX IF NOT EXISTS idx_bank_amount ON bank_transactions(amount);
    
    -- 发票索引
    CREATE INDEX IF NOT EXISTS idx_invoice_batch_id ON invoices(batch_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_status ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_invoice_seller_name ON invoices(seller_name);
    CREATE INDEX IF NOT EXISTS idx_invoice_amount ON invoices(amount);
    
    -- 付款人对应关系索引
    CREATE INDEX IF NOT EXISTS idx_mapping_person_name ON payer_mappings(person_name);
    CREATE INDEX IF NOT EXISTS idx_mapping_company_name ON payer_mappings(company_name);
    
    -- 匹配结果索引
    CREATE INDEX IF NOT EXISTS idx_match_batch_id ON match_results(batch_id);
    CREATE INDEX IF NOT EXISTS idx_match_type ON match_results(match_type);
    
    -- 异常索引
    CREATE INDEX IF NOT EXISTS idx_exception_batch_id ON exceptions(batch_id);
    CREATE INDEX IF NOT EXISTS idx_exception_type ON exceptions(type);
    CREATE INDEX IF NOT EXISTS idx_exception_status ON exceptions(status);

    -- 报告索引
    CREATE INDEX IF NOT EXISTS idx_report_batch_id ON reports(batch_id);
    CREATE INDEX IF NOT EXISTS idx_report_created_at ON reports(created_at);
  `)


}

/**
 * 获取数据库连接（懒加载单例）
 */
export function getDatabase(): BetterSQLite3Database<typeof schema> {
  if (!db) {
    // 确保目录存在
    ensureDir(getDatabaseDir())

    // 创建 SQLite 连接
    const dbPath = getDatabasePath()
    sqliteDb = new Database(dbPath)

    // 启用外键约束
    sqliteDb.pragma('foreign_keys = ON')

    // 优化性能
    sqliteDb.pragma('journal_mode = WAL')

    // 初始化表结构
    initializeTables(sqliteDb)

    // 创建 Drizzle ORM 实例
    db = drizzle(sqliteDb, { schema })

    console.log(`[Database] Connected to ${dbPath}`)
  }

  return db
}

/**
 * 获取原始 SQLite 连接
 * 用于需要直接执行 SQL 的场景
 */
export function getSqliteDatabase(): Database.Database {
  if (!sqliteDb) {
    getDatabase() // 触发初始化
  }
  return sqliteDb!
}

/**
 * 关闭数据库连接
 * 应用退出时调用
 */
export function closeDatabase(): void {
  if (sqliteDb) {
    sqliteDb.close()
    sqliteDb = null
    db = null
    console.log('[Database] Connection closed')
  }
}

/**
 * 获取数据库文件大小（字节）
 */
export function getDatabaseSize(): number {
  const dbPath = getDatabasePath()
  if (fs.existsSync(dbPath)) {
    const stats = fs.statSync(dbPath)
    return stats.size
  }
  return 0
}

/**
 * 备份数据库
 */
export function backupDatabase(backupPath: string): void {
  if (sqliteDb) {
    sqliteDb.backup(backupPath)
    console.log(`[Database] Backed up to ${backupPath}`)
  }
}
