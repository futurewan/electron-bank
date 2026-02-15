/**
 * 规则匹配服务
 * 实现本地三级漏斗匹配引擎
 */
import { and, eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/client'
import {
    BankTransaction,
    bankTransactions,
    Invoice,
    invoices,
    matchResults,
    NewMatchResult,
    payerMappings,
    reconciliationBatches
} from '../database/schema'
import { normalizeName } from './parseService'
import { isStopped } from './taskService'

// ============================================
// 类型定义
// ============================================

/**
 * 匹配类型
 */
export type MatchType = 'perfect' | 'tolerance' | 'proxy' | 'ai'

/**
 * 匹配结果统计
 */
export interface MatchingStats {
  perfectCount: number
  toleranceCount: number
  proxyCount: number
  aiCount: number
  remainingBankCount: number
  remainingInvoiceCount: number
  duration: number
}

/**
 * 匹配进度回调
 */
export type MatchingProgressCallback = (progress: {
  level: 1 | 2 | 3
  current: number
  total: number
  matchedCount: number
  message: string
}) => void

/**
 * 单条匹配记录
 */
interface MatchRecord {
  bankId: string
  invoiceId: string
  matchType: MatchType
  reason: string
  confidence: number
  amountDiff: number
}

// ============================================
// 容差配置
// ============================================

/**
 * 手续费容差（元）
 */
const TOLERANCE_AMOUNT = 20

// ============================================
// 匹配算法
// ============================================

/**
 * 执行规则匹配
 */
export async function executeRuleMatching(
  batchId: string,
  onProgress?: MatchingProgressCallback
): Promise<MatchingStats> {
  const startTime = Date.now()
  const db = getDatabase()
  
  // 获取待匹配数据
  const bankTxns = await db.select()
    .from(bankTransactions)
    .where(and(
      eq(bankTransactions.batchId, batchId),
      eq(bankTransactions.status, 'pending')
    ))
  
  const invoiceList = await db.select()
    .from(invoices)
    .where(and(
      eq(invoices.batchId, batchId),
      eq(invoices.status, 'pending')
    ))
  
  // 获取付款人对应关系
  const mappings = await db.select().from(payerMappings)
  
  // 匹配结果收集
  const allMatches: MatchRecord[] = []
  const matchedBankIds = new Set<string>()
  const matchedInvoiceIds = new Set<string>()
  
  let perfectCount = 0
  let toleranceCount = 0
  let proxyCount = 0
  
  const totalTasks = bankTxns.length
  
  // ============================================
  // Level 1: 完美匹配
  // ============================================
  onProgress?.({
    level: 1,
    current: 0,
    total: totalTasks,
    matchedCount: 0,
    message: '开始 Level 1: 完美匹配...',
  })
  
  for (let i = 0; i < bankTxns.length; i++) {
    // 每 100 条记录让位一次事件循环，防止阻塞主线程导致无法接收停止指令
    if (i % 100 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    if (isStopped(batchId)) throw new Error('任务被用户停止')
    const bank = bankTxns[i]
    if (matchedBankIds.has(bank.id)) continue
    
    const normalizedBankName = normalizeName(bank.payerName)
    
    // 查找完美匹配：金额相等 + 户名相等
    const matchedInvoice = invoiceList.find(inv => 
      !matchedInvoiceIds.has(inv.id) &&
      bank.amount === inv.amount &&
      normalizeName(inv.sellerName) === normalizedBankName
    )
    
    if (matchedInvoice) {
      allMatches.push({
        bankId: bank.id,
        invoiceId: matchedInvoice.id,
        matchType: 'perfect',
        reason: '金额与户名完全一致',
        confidence: 1.0,
        amountDiff: 0,
      })
      matchedBankIds.add(bank.id)
      matchedInvoiceIds.add(matchedInvoice.id)
      perfectCount++
    }
    
    if (i % 100 === 0) {
      onProgress?.({
        level: 1,
        current: i,
        total: totalTasks,
        matchedCount: perfectCount,
        message: `Level 1 进度: ${i}/${totalTasks}`,
      })
    }
  }
  
  console.log(`[Matching] Level 1 完美匹配完成: ${perfectCount} 条`)
  
  // ============================================
  // Level 2: 容差匹配
  // ============================================
  onProgress?.({
    level: 2,
    current: 0,
    total: totalTasks - matchedBankIds.size,
    matchedCount: perfectCount,
    message: '开始 Level 2: 容差匹配...',
  })
  
  let level2Processed = 0
  for (let i = 0; i < bankTxns.length; i++) {
    if (i % 100 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    if (isStopped(batchId)) throw new Error('任务被用户停止')
    const bank = bankTxns[i]
    level2Processed++
    
    const normalizedBankName = normalizeName(bank.payerName)
    
    // 查找容差匹配：户名相等 + 金额差 ≤ 20
    const matchedInvoice = invoiceList.find(inv => {
      if (matchedInvoiceIds.has(inv.id)) return false
      if (normalizeName(inv.sellerName) !== normalizedBankName) return false
      
      const diff = inv.amount - bank.amount
      // 只匹配发票金额 > 银行金额的情况（手续费被扣减）
      return diff > 0 && diff <= TOLERANCE_AMOUNT
    })
    
    if (matchedInvoice) {
      const diff = matchedInvoice.amount - bank.amount
      allMatches.push({
        bankId: bank.id,
        invoiceId: matchedInvoice.id,
        matchType: 'tolerance',
        reason: `手续费差异 ${diff.toFixed(2)} 元（银行转账手续费）`,
        confidence: 0.95,
        amountDiff: diff,
      })
      matchedBankIds.add(bank.id)
      matchedInvoiceIds.add(matchedInvoice.id)
      toleranceCount++
    }
    
    if (level2Processed % 100 === 0) {
      onProgress?.({
        level: 2,
        current: level2Processed,
        total: totalTasks - perfectCount,
        matchedCount: perfectCount + toleranceCount,
        message: `Level 2 进度: ${level2Processed}/${totalTasks - perfectCount}`,
      })
    }
  }
  
  console.log(`[Matching] Level 2 容差匹配完成: ${toleranceCount} 条`)
  
  // ============================================
  // Level 3: 关系映射匹配
  // ============================================
  onProgress?.({
    level: 3,
    current: 0,
    total: totalTasks - matchedBankIds.size,
    matchedCount: perfectCount + toleranceCount,
    message: '开始 Level 3: 关系映射匹配...',
  })
  
  // 构建关系映射索引（个人 -> 公司列表）
  const personToCompanies = new Map<string, string[]>()
  for (const mapping of mappings) {
    const person = normalizeName(mapping.personName)
    if (!personToCompanies.has(person)) {
      personToCompanies.set(person, [])
    }
    personToCompanies.get(person)!.push(normalizeName(mapping.companyName))
  }
  
  let level3Processed = 0
  for (let i = 0; i < bankTxns.length; i++) {
    if (i % 100 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    if (isStopped(batchId)) throw new Error('任务被用户停止')
    const bank = bankTxns[i]
    level3Processed++
    
    const normalizedBankName = normalizeName(bank.payerName)
    const relatedCompanies = personToCompanies.get(normalizedBankName)
    
    if (!relatedCompanies || relatedCompanies.length === 0) continue
    
    // 查找关系映射匹配
    const matchedInvoice = invoiceList.find(inv => {
      if (matchedInvoiceIds.has(inv.id)) return false
      
      const normalizedSellerName = normalizeName(inv.sellerName)
      if (!relatedCompanies.includes(normalizedSellerName)) return false
      
      // 金额匹配（完美或容差）
      const diff = Math.abs(inv.amount - bank.amount)
      return diff === 0 || (inv.amount > bank.amount && diff <= TOLERANCE_AMOUNT)
    })
    
    if (matchedInvoice) {
      const diff = matchedInvoice.amount - bank.amount
      const mapping = mappings.find(m => 
        normalizeName(m.personName) === normalizedBankName &&
        normalizeName(m.companyName) === normalizeName(matchedInvoice.sellerName)
      )
      
      allMatches.push({
        bankId: bank.id,
        invoiceId: matchedInvoice.id,
        matchType: 'proxy',
        reason: `代付关系：${bank.payerName} 代表 ${matchedInvoice.sellerName} 付款${mapping?.remark ? `（${mapping.remark}）` : ''}`,
        confidence: 0.99,
        amountDiff: diff > 0 ? diff : 0,
      })
      matchedBankIds.add(bank.id)
      matchedInvoiceIds.add(matchedInvoice.id)
      proxyCount++
    }
    
    if (level3Processed % 50 === 0) {
      onProgress?.({
        level: 3,
        current: level3Processed,
        total: totalTasks - perfectCount - toleranceCount,
        matchedCount: perfectCount + toleranceCount + proxyCount,
        message: `Level 3 进度: ${level3Processed}/${totalTasks - perfectCount - toleranceCount}`,
      })
    }
  }
  
  console.log(`[Matching] Level 3 关系映射匹配完成: ${proxyCount} 条`)
  
  // ============================================
  // 保存匹配结果
  // ============================================
  await saveMatchResults(batchId, allMatches)
  
  // 更新银行流水和发票状态
  await updateTransactionStatus(allMatches)
  
  // 更新批次统计
  const remainingBankCount = bankTxns.length - matchedBankIds.size
  const remainingInvoiceCount = invoiceList.length - matchedInvoiceIds.size
  
  await db.update(reconciliationBatches)
    .set({
      status: 'matching',
      matchedCount: allMatches.length,
      unmatchedCount: remainingBankCount + remainingInvoiceCount,
    })
    .where(eq(reconciliationBatches.id, batchId))
  
  const duration = Date.now() - startTime
  
  console.log(`[Matching] 规则匹配完成，耗时 ${duration}ms`)
  console.log(`[Matching] 统计: 完美=${perfectCount}, 容差=${toleranceCount}, 代付=${proxyCount}, 剩余=${remainingBankCount}`)
  
  return {
    perfectCount,
    toleranceCount,
    proxyCount,
    aiCount: 0,
    remainingBankCount,
    remainingInvoiceCount,
    duration,
  }
}

/**
 * 保存匹配结果到数据库
 */
async function saveMatchResults(batchId: string, matches: MatchRecord[]): Promise<void> {
  if (matches.length === 0) return
  
  const db = getDatabase()
  const now = new Date()
  
  const records: NewMatchResult[] = matches.map(m => ({
    id: uuidv4(),
    batchId,
    bankId: m.bankId,
    invoiceId: m.invoiceId,
    matchType: m.matchType,
    reason: m.reason,
    confidence: m.confidence,
    amountDiff: m.amountDiff,
    needsConfirmation: m.matchType === 'ai' && m.confidence < 0.8,
    confirmed: m.confidence >= 0.8,
    createdAt: now,
  }))
  
  // 分批插入
  const BATCH_SIZE = 100
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    await db.insert(matchResults).values(batch)
  }
  
  console.log(`[Matching] 保存 ${records.length} 条匹配结果`)
}

/**
 * 更新银行流水和发票状态
 */
async function updateTransactionStatus(matches: MatchRecord[]): Promise<void> {
  const db = getDatabase()
  
  for (const match of matches) {
    // 更新银行流水状态
    await db.update(bankTransactions)
      .set({
        status: 'matched',
        matchId: match.bankId,  // 自引用，用于关联
      })
      .where(eq(bankTransactions.id, match.bankId))
    
    // 更新发票状态
    await db.update(invoices)
      .set({
        status: 'matched',
        matchId: match.invoiceId,
      })
      .where(eq(invoices.id, match.invoiceId))
  }
}

// ============================================
// 查询辅助函数
// ============================================

/**
 * 获取未匹配的银行流水
 */
export async function getUnmatchedBankTransactions(batchId: string): Promise<BankTransaction[]> {
  const db = getDatabase()
  return db.select()
    .from(bankTransactions)
    .where(and(
      eq(bankTransactions.batchId, batchId),
      eq(bankTransactions.status, 'pending')
    ))
}

/**
 * 获取未匹配的发票
 */
export async function getUnmatchedInvoices(batchId: string): Promise<Invoice[]> {
  const db = getDatabase()
  return db.select()
    .from(invoices)
    .where(and(
      eq(invoices.batchId, batchId),
      eq(invoices.status, 'pending')
    ))
}

/**
 * 获取批次的匹配结果
 */
export async function getMatchResults(batchId: string) {
  const db = getDatabase()
  return db.select({
    id: matchResults.id,
    matchType: matchResults.matchType,
    reason: matchResults.reason,
    amountDiff: matchResults.amountDiff,
    confidence: matchResults.confidence,
    bankPayer: bankTransactions.payerName,
    bankAmount: bankTransactions.amount,
    invoiceSeller: invoices.sellerName,
    invoiceAmount: invoices.amount,
  })
    .from(matchResults)
    .leftJoin(bankTransactions, eq(matchResults.bankId, bankTransactions.id))
    .leftJoin(invoices, eq(matchResults.invoiceId, invoices.id))
    .where(eq(matchResults.batchId, batchId))
}

/**
 * 获取批次的匹配统计
 */
export async function getMatchingStats(batchId: string): Promise<MatchingStats> {
  const results = await getMatchResults(batchId)
  
  const perfectCount = results.filter(r => r.matchType === 'perfect').length
  const toleranceCount = results.filter(r => r.matchType === 'tolerance').length
  const proxyCount = results.filter(r => r.matchType === 'proxy').length
  const aiCount = results.filter(r => r.matchType === 'ai').length
  
  const unmatchedBank = await getUnmatchedBankTransactions(batchId)
  const unmatchedInvoice = await getUnmatchedInvoices(batchId)
  
  return {
    perfectCount,
    toleranceCount,
    proxyCount,
    aiCount,
    remainingBankCount: unmatchedBank.length,
    remainingInvoiceCount: unmatchedInvoice.length,
    duration: 0,
  }
}
