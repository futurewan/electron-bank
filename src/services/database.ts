/**
 * 数据库服务
 * 封装对 Electron 数据库 API 的调用
 */
import type {
    AIConversation,
    Bill,
    NewAIConversation,
    NewBill,
    NewReconciliationRecord,
    NewTransaction,
    QueryFilter,
    QueryResult,
    ReconciliationRecord,
    Transaction
} from '../types/database'

/**
 * 检查 Electron API 是否可用
 */
function checkElectronAPI(): boolean {
  return typeof window !== 'undefined' && !!window.electron?.db
}

/**
 * 对账记录服务
 */
export const recordService = {
  /**
   * 查询对账记录列表
   */
  async list(filter?: QueryFilter): Promise<QueryResult<ReconciliationRecord>> {
    if (!checkElectronAPI()) {
      console.warn('[DB] Electron API not available')
      return { data: [], total: 0, page: 1, pageSize: 50 }
    }
    return window.electron.db.query<ReconciliationRecord>('reconciliation_records', filter)
  },

  /**
   * 创建对账记录
   */
  async create(data: NewReconciliationRecord): Promise<string> {
    if (!checkElectronAPI()) throw new Error('Electron API not available')
    const result = await window.electron.db.insert('reconciliation_records', data)
    return result.id
  },

  /**
   * 更新对账记录
   */
  async update(id: string, data: Partial<ReconciliationRecord>): Promise<boolean> {
    if (!checkElectronAPI()) throw new Error('Electron API not available')
    const result = await window.electron.db.update('reconciliation_records', id, data)
    return result.success
  },

  /**
   * 删除对账记录
   */
  async delete(id: string): Promise<boolean> {
    if (!checkElectronAPI()) throw new Error('Electron API not available')
    const result = await window.electron.db.delete('reconciliation_records', id)
    return result.success
  },

  /**
   * 批量创建
   */
  async batchCreate(items: NewReconciliationRecord[]): Promise<string[]> {
    if (!checkElectronAPI()) throw new Error('Electron API not available')
    const result = await window.electron.db.batchInsert('reconciliation_records', items)
    return result.ids
  },
}

/**
 * 账单服务
 */
export const billService = {
  async list(filter?: QueryFilter): Promise<QueryResult<Bill>> {
    if (!checkElectronAPI()) {
      return { data: [], total: 0, page: 1, pageSize: 50 }
    }
    return window.electron.db.query<Bill>('bills', filter)
  },

  async create(data: NewBill): Promise<string> {
    if (!checkElectronAPI()) throw new Error('Electron API not available')
    const result = await window.electron.db.insert('bills', data)
    return result.id
  },

  async update(id: string, data: Partial<Bill>): Promise<boolean> {
    if (!checkElectronAPI()) throw new Error('Electron API not available')
    const result = await window.electron.db.update('bills', id, data)
    return result.success
  },

  async delete(id: string): Promise<boolean> {
    if (!checkElectronAPI()) throw new Error('Electron API not available')
    const result = await window.electron.db.delete('bills', id)
    return result.success
  },

  async batchCreate(items: NewBill[]): Promise<string[]> {
    if (!checkElectronAPI()) throw new Error('Electron API not available')
    const result = await window.electron.db.batchInsert('bills', items)
    return result.ids
  },
}

/**
 * 交易服务
 */
export const transactionService = {
  async list(filter?: QueryFilter): Promise<QueryResult<Transaction>> {
    if (!checkElectronAPI()) {
      return { data: [], total: 0, page: 1, pageSize: 50 }
    }
    return window.electron.db.query<Transaction>('transactions', filter)
  },

  async create(data: NewTransaction): Promise<string> {
    if (!checkElectronAPI()) throw new Error('Electron API not available')
    const result = await window.electron.db.insert('transactions', data)
    return result.id
  },

  async update(id: string, data: Partial<Transaction>): Promise<boolean> {
    if (!checkElectronAPI()) throw new Error('Electron API not available')
    const result = await window.electron.db.update('transactions', id, data)
    return result.success
  },

  async delete(id: string): Promise<boolean> {
    if (!checkElectronAPI()) throw new Error('Electron API not available')
    const result = await window.electron.db.delete('transactions', id)
    return result.success
  },

  async batchCreate(items: NewTransaction[]): Promise<string[]> {
    if (!checkElectronAPI()) throw new Error('Electron API not available')
    const result = await window.electron.db.batchInsert('transactions', items)
    return result.ids
  },
}

/**
 * AI 对话服务
 */
export const conversationService = {
  async list(filter?: QueryFilter): Promise<QueryResult<AIConversation>> {
    if (!checkElectronAPI()) {
      return { data: [], total: 0, page: 1, pageSize: 50 }
    }
    return window.electron.db.query<AIConversation>('ai_conversations', filter)
  },

  async create(data: NewAIConversation): Promise<string> {
    if (!checkElectronAPI()) throw new Error('Electron API not available')
    const result = await window.electron.db.insert('ai_conversations', data)
    return result.id
  },

  async delete(id: string): Promise<boolean> {
    if (!checkElectronAPI()) throw new Error('Electron API not available')
    const result = await window.electron.db.delete('ai_conversations', id)
    return result.success
  },

  /**
   * 获取记录的对话历史
   */
  async getByRecordId(recordId: string): Promise<AIConversation[]> {
    const result = await this.list({
      where: { recordId },
      orderBy: { field: 'createdAt', direction: 'asc' },
    })
    return result.data
  },
}
