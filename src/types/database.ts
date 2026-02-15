/**
 * 数据库类型定义
 */

/**
 * 对账记录
 */
export interface ReconciliationRecord {
  id: string
  billNumber: string
  amount: number
  status: 'pending' | 'matched' | 'unmatched'
  aiAnalysis?: string
  createdAt: Date
  updatedAt: Date
}

/**
 * 新建对账记录
 */
export interface NewReconciliationRecord {
  id?: string
  billNumber: string
  amount: number
  status?: 'pending' | 'matched' | 'unmatched'
  aiAnalysis?: string
}

/**
 * 账单
 */
export interface Bill {
  id: string
  recordId?: string
  type: 'income' | 'expense'
  amount: number
  date: Date
  description?: string
  source?: string
  category?: string
  createdAt: Date
}

/**
 * 新建账单
 */
export interface NewBill {
  id?: string
  recordId?: string
  type: 'income' | 'expense'
  amount: number
  date: Date
  description?: string
  source?: string
  category?: string
}

/**
 * 交易明细
 */
export interface Transaction {
  id: string
  billId?: string
  amount: number
  transactionDate: Date
  counterparty?: string
  remark?: string
  transactionNo?: string
  createdAt: Date
}

/**
 * 新建交易
 */
export interface NewTransaction {
  id?: string
  billId?: string
  amount: number
  transactionDate: Date
  counterparty?: string
  remark?: string
  transactionNo?: string
}

/**
 * AI 对话
 */
export interface AIConversation {
  id: string
  recordId?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  model?: string
  tokenCount?: number
  createdAt: Date
}

/**
 * 新建 AI 对话
 */
export interface NewAIConversation {
  id?: string
  recordId?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  model?: string
  tokenCount?: number
}

/**
 * 查询过滤参数
 */
export interface QueryFilter {
  where?: Record<string, any>
  orderBy?: {
    field: string
    direction: 'asc' | 'desc'
  }
  pagination?: {
    page: number
    pageSize: number
  }
}

/**
 * 查询结果
 */
export interface QueryResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

/**
 * 表名类型
 */
export type TableName = 
  | 'reconciliation_records'
  | 'bills'
  | 'transactions'
  | 'ai_conversations'
