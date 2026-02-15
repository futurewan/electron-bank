/**
 * 付款人映射服务
 * 提供智能代付检测、映射管理等功能
 */
import { eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/client'
import {
    bankTransactions,
    invoices,
    payerMappings,
    type PayerMapping
} from '../database/schema'

// ============================================
// 类型定义
// ============================================

export interface ProxyPaymentResult {
  bankTransactionId: string
  payerName: string
  amount: number
  remark: string | null
  transactionDate: Date | null
  reason: string
}

export interface AggregatedProxyPayment {
  payerName: string
  totalAmount: number
  transactionCount: number
  transactions: ProxyPaymentResult[]
  reason: string
}

export interface NewMappingInput {
  personName: string
  companyName: string
  accountSuffix?: string | null
  remark?: string | null
  source?: 'manual' | 'ai_extracted' | 'imported' | 'quick_add'
}

export interface BatchAddResult {
  success: number
  failed: number
  errors: Array<{ personName: string; error: string }>
}

// ============================================
// 智能代付检测
// ============================================

/**
 * 判断是否疑似个人户名
 */
export function isLikelyPersonName(name: string): boolean {
  if (!name || typeof name !== 'string') return false
  
  // 去除空格
  const trimmedName = name.replace(/\s/g, '')
  
  // 规则 1: 长度限制在 2-3 个字符 (针对普通姓名)
  if (trimmedName.length < 2 || trimmedName.length > 3) {
    return false
  }

  // 规则 2: 必须全部是中文字符
  const allChinese = /^[\u4e00-\u9fa5]+$/.test(trimmedName)
  if (!allChinese) {
    return false
  }
  
  // 规则 3: 不含明显的机构关键词
  const companyKeywords = [
    '公司', '有限', '集团', '商店', '店铺', '厂', '企业', 
    '事务所', '银行', '证券', '保险', '基金', '学校', '医院',
    '政府', '机关', '协会', '中心', '研究所', '院'
  ]
  if (companyKeywords.some(kw => trimmedName.includes(kw))) {
    return false
  }
  
  return true
}

/**
 * 检测批次内的疑似代付记录
 */
export async function detectProxyPayments(batchId: string): Promise<ProxyPaymentResult[]> {
  const db = getDatabase()
  
  // 1. 获取批次内所有银行流水
  const bankTxs = await db.select().from(bankTransactions).where(
    eq(bankTransactions.batchId, batchId)
  )
  
  // 2. 获取现有映射表
  const existingMappings = await db.select().from(payerMappings)
  const mappedNames = new Set(existingMappings.map(m => m.personName?.toLowerCase()))
  
  // 3. 获取发票销售方名单
  const batchInvoices = await db.select().from(invoices).where(
    eq(invoices.batchId, batchId)
  )
  const companyNames = new Set(batchInvoices.map(i => i.sellerName?.toLowerCase()).filter(Boolean))
  
  // 4. 检测每条银行流水
  const results: ProxyPaymentResult[] = []
  
  for (const tx of bankTxs) {
    const payerName = tx.payerName
    if (!payerName) continue
    
    // 已有映射，跳过
    if (mappedNames.has(payerName.toLowerCase())) continue
    
    // 是已知公司名，跳过
    if (companyNames.has(payerName.toLowerCase())) continue
    
    // 判断是否疑似个人户名
    if (isLikelyPersonName(payerName)) {
      results.push({
        bankTransactionId: tx.id,
        payerName,
        amount: tx.amount || 0,
        remark: tx.remark || null,
        transactionDate: tx.transactionDate || null,
        reason: '疑似个人户名'
      })
    }
  }
  
  return results
}

/**
 * 按付款人聚合疑似代付记录
 */
export function aggregateByPayer(results: ProxyPaymentResult[]): AggregatedProxyPayment[] {
  const grouped = new Map<string, ProxyPaymentResult[]>()
  
  for (const r of results) {
    const list = grouped.get(r.payerName) || []
    list.push(r)
    grouped.set(r.payerName, list)
  }
  
  return Array.from(grouped.entries()).map(([payerName, txs]) => ({
    payerName,
    totalAmount: txs.reduce((sum, t) => sum + t.amount, 0),
    transactionCount: txs.length,
    transactions: txs,
    reason: txs[0].reason
  }))
}

// ============================================
// 映射 CRUD 操作
// ============================================

/**
 * 获取所有映射关系
 */
export async function getAllMappings(): Promise<PayerMapping[]> {
  const db = getDatabase()
  return db.select().from(payerMappings)
}

/**
 * 添加单条映射关系
 */
export async function addMapping(mapping: NewMappingInput): Promise<string> {
  const db = getDatabase()
  const id = uuidv4()
  
  await db.insert(payerMappings).values({
    id,
    personName: mapping.personName,
    companyName: mapping.companyName,
    accountSuffix: mapping.accountSuffix || null,
    remark: mapping.remark || null,
    source: mapping.source || 'manual',
    createdAt: new Date(),
  })
  
  return id
}

/**
 * 批量添加映射关系
 */
export async function batchAddMappings(mappings: NewMappingInput[]): Promise<BatchAddResult> {
  const result: BatchAddResult = {
    success: 0,
    failed: 0,
    errors: []
  }
  
  for (const mapping of mappings) {
    try {
      await addMapping(mapping)
      result.success++
    } catch (error: any) {
      result.failed++
      result.errors.push({
        personName: mapping.personName,
        error: error?.message || '未知错误'
      })
    }
  }
  
  return result
}

/**
 * 更新映射关系
 */
export async function updateMapping(
  id: string, 
  data: Partial<Omit<NewMappingInput, 'source'>>
): Promise<void> {
  const db = getDatabase()
  
  await db.update(payerMappings)
    .set({
      ...(data.personName && { personName: data.personName }),
      ...(data.companyName && { companyName: data.companyName }),
      ...(data.accountSuffix !== undefined && { accountSuffix: data.accountSuffix }),
      ...(data.remark !== undefined && { remark: data.remark }),
    })
    .where(eq(payerMappings.id, id))
}

/**
 * 删除映射关系
 */
export async function deleteMapping(id: string): Promise<void> {
  const db = getDatabase()
  await db.delete(payerMappings).where(eq(payerMappings.id, id))
}

/**
 * 搜索映射关系
 */
export async function searchMappings(keyword: string): Promise<PayerMapping[]> {
  const db = getDatabase()
  const all = await db.select().from(payerMappings)
  
  if (!keyword) return all
  
  const lowerKeyword = keyword.toLowerCase()
  return all.filter(m => 
    m.personName.toLowerCase().includes(lowerKeyword) ||
    m.companyName.toLowerCase().includes(lowerKeyword)
  )
}

/**
 * 获取发票销售方列表（用于添加映射时的下拉建议）
 */
export async function getSellerSuggestions(batchId?: string): Promise<string[]> {
  const db = getDatabase()
  
  let query = db.select({ sellerName: invoices.sellerName }).from(invoices)
  
  if (batchId) {
    query = query.where(eq(invoices.batchId, batchId)) as typeof query
  }
  
  const results = await query
  const uniqueNames = new Set(results.map(r => r.sellerName).filter(Boolean))
  return Array.from(uniqueNames) as string[]
}

/**
 * 执行付款人映射去重
 * 规则：名字和公司都相同的记录，保留最早创建的一条，删除其他的
 */
export async function deduplicateMappings(): Promise<number> {
  const db = getDatabase()
  
  // 1. 获取所有映射
  const allMappings = await db.select().from(payerMappings)
  
  if (allMappings.length === 0) return 0
  
  // 2. 分组
  const grouped = new Map<string, PayerMapping[]>()
  
  for (const m of allMappings) {
    const key = `${m.personName}|${m.companyName}`
    const existingGroup = grouped.get(key)
    if (existingGroup) {
      existingGroup.push(m)
    } else {
      grouped.set(key, [m])
    }
  }
  
  // 3. 找出需要删除的 ID
  const idsToDelete: string[] = []
  
  for (const group of grouped.values()) {
    if (group.length > 1) {
      // 按创建时间排序，保留最早的
      group.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return timeA - timeB
      })
      
      // 删除除了第一个之外的所有记录
      for (let i = 1; i < group.length; i++) {
        idsToDelete.push(group[i].id)
      }
    }
  }
  
  // 4. 执行删除
  let deletedCount = 0
  if (idsToDelete.length > 0) {
    for (const id of idsToDelete) {
      await db.delete(payerMappings).where(eq(payerMappings.id, id))
      deletedCount++
    }
  }
  
  return deletedCount
}
