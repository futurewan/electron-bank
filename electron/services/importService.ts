/**
 * 导入服务
 * 负责将解析后的数据存入数据库
 */
import { eq, desc } from 'drizzle-orm'
import path from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/client'
import {
  bankTransactions,
  invoices,
  NewBankTransaction,
  NewInvoice,
  NewPayerMapping,
  NewReconciliationBatch,
  payerMappings,
  reconciliationBatches,
} from '../database/schema'
import {
  parseBankTransactions,
  parseInvoices,
  parsePayerMappings,
  readPdfText
} from './parseService'

// ============================================
// 类型定义
// ============================================

/**
 * 导入进度回调
 */
export type ImportProgressCallback = (progress: ImportProgress) => void

/**
 * 导入进度
 */
export interface ImportProgress {
  stage: 'reading' | 'parsing' | 'saving' | 'done'
  current: number
  total: number
  message: string
}

/**
 * 导入结果
 */
export interface ImportResult {
  success: boolean
  count: number
  errors: Array<{ row: number; message: string }>
  batchId?: string
}

// ============================================
// 批次管理
// ============================================

/**
 * 创建核销批次
 */
export async function createBatch(name: string): Promise<string> {
  const db = getDatabase()
  const id = uuidv4()
  const now = new Date()

  const batch: NewReconciliationBatch = {
    id,
    name,
    status: 'pending',
    totalBankCount: 0,
    totalInvoiceCount: 0,
    matchedCount: 0,
    unmatchedCount: 0,
    tokensUsed: 0,
    createdAt: now,
  }

  await db.insert(reconciliationBatches).values(batch)
  console.log(`[Import] Created batch: ${id} - ${name}`)

  return id
}

/**
 * 更新批次状态
 */
export async function updateBatchStatus(
  batchId: string,
  status: 'pending' | 'matching' | 'completed' | 'failed' | 'unbalanced' | 'archived',
  counts?: {
    totalBankCount?: number
    totalInvoiceCount?: number
    matchedCount?: number
    unmatchedCount?: number
    exceptionCount?: number
    tokensUsed?: number
  }
): Promise<void> {
  const db = getDatabase()

  const updateData: Record<string, any> = { status }
  if (counts?.totalBankCount !== undefined) updateData.totalBankCount = counts.totalBankCount
  if (counts?.totalInvoiceCount !== undefined) updateData.totalInvoiceCount = counts.totalInvoiceCount
  if (counts?.matchedCount !== undefined) updateData.matchedCount = counts.matchedCount
  if (counts?.unmatchedCount !== undefined) updateData.unmatchedCount = counts.unmatchedCount
  if (counts?.exceptionCount !== undefined) updateData.exceptionCount = counts.exceptionCount
  if (counts?.tokensUsed !== undefined) updateData.tokensUsed = counts.tokensUsed

  if (status === 'completed') updateData.completedAt = new Date()

  await db.update(reconciliationBatches)
    .set(updateData)
    .where(eq(reconciliationBatches.id, batchId))
}

/**
 * 获取批次信息
 */
export async function getBatch(batchId: string) {
  const db = getDatabase()
  const result = await db.select()
    .from(reconciliationBatches)
    .where(eq(reconciliationBatches.id, batchId))
    .limit(1)

  return result[0] || null
}

/**
 * 获取所有批次
 */
export async function getAllBatches() {
  const db = getDatabase()
  return db.select()
    .from(reconciliationBatches)
    .orderBy(desc(reconciliationBatches.createdAt))
}

/**
 * 删除批次（级联删除相关数据）
 */
export async function deleteBatch(batchId: string): Promise<void> {
  const db = getDatabase()
  await db.delete(reconciliationBatches)
    .where(eq(reconciliationBatches.id, batchId))
}

// ============================================
// 银行流水导入
// ============================================

/**
 * 导入银行流水
 */
export async function importBankTransactions(
  batchId: string,
  filePath: string,
  onProgress?: ImportProgressCallback
): Promise<ImportResult> {
  onProgress?.({
    stage: 'reading',
    current: 0,
    total: 100,
    message: '正在读取文件...',
  })

  // 解析文件
  onProgress?.({
    stage: 'parsing',
    current: 10,
    total: 100,
    message: '正在解析数据...',
  })

  const parseResult = parseBankTransactions(filePath)

  if (parseResult.data.length === 0) {
    return {
      success: false,
      count: 0,
      errors: parseResult.errors.length > 0
        ? parseResult.errors
        : [{ row: 0, message: '文件中没有有效数据' }],
    }
  }

  // 保存到数据库
  onProgress?.({
    stage: 'saving',
    current: 50,
    total: 100,
    message: `正在保存 ${parseResult.data.length} 条记录...`,
  })

  const db = getDatabase()
  const now = new Date()

  // --- 关键修复：导入不应清理旧数据，因为可能是多文件导入 ---
  // console.log(`[Import] 正在清理批次 ${batchId} 的旧银行流水...`)
  // await db.delete(bankTransactions).where(eq(bankTransactions.batchId, batchId))
  // ----------------------------------------------

  // --- 去重：按 payerName + amount + transactionDate 去重 ---
  const seenKeys = new Set<string>()
  const uniqueData = parseResult.data.filter(item => {
    const dateStr = item.transactionDate
      ? item.transactionDate.toISOString().split('T')[0]
      : ''
    const key = `${(item.payerName || '').trim()}|${item.amount}|${dateStr}`
    if (seenKeys.has(key)) return false
    seenKeys.add(key)
    return true
  })

  if (uniqueData.length !== parseResult.data.length) {
    console.log(`[Import] 银行流水去重: ${parseResult.data.length} -> ${uniqueData.length} (移除 ${parseResult.data.length - uniqueData.length} 条重复)`)
  }

  const records: NewBankTransaction[] = uniqueData.map((item) => ({
    id: uuidv4(),
    batchId,
    transactionDate: item.transactionDate,
    payerName: item.payerName,
    payerAccount: item.payerAccount,
    amount: item.amount,
    remark: item.remark,
    transactionNo: item.transactionNo,
    status: 'pending' as const,
    createdAt: now,
  }))

  // 分批插入（每批 100 条）
  const BATCH_SIZE = 100
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    await db.insert(bankTransactions).values(batch)

    onProgress?.({
      stage: 'saving',
      current: 50 + Math.floor((i / records.length) * 40),
      total: 100,
      message: `已保存 ${Math.min(i + BATCH_SIZE, records.length)} / ${records.length} 条`,
    })
  }

  // 更新批次统计
  const existingBatch = await getBatch(batchId)
  await updateBatchStatus(batchId, 'pending', {
    totalBankCount: (existingBatch?.totalBankCount || 0) + records.length,
    totalInvoiceCount: existingBatch?.totalInvoiceCount || 0,
  })

  onProgress?.({
    stage: 'done',
    current: 100,
    total: 100,
    message: `导入完成，共 ${records.length} 条记录`,
  })

  return {
    success: true,
    count: records.length,
    errors: parseResult.errors,
    batchId,
  }
}

// ============================================
// 发票导入
// ============================================

/**
 * 导入发票数据（Excel）
 */
export async function importInvoices(
  batchId: string,
  filePath: string,
  onProgress?: ImportProgressCallback
): Promise<ImportResult> {
  onProgress?.({
    stage: 'reading',
    current: 0,
    total: 100,
    message: '正在读取文件...',
  })

  // 解析文件
  onProgress?.({
    stage: 'parsing',
    current: 10,
    total: 100,
    message: '正在解析数据...',
  })

  const parseResult = parseInvoices(filePath)

  if (parseResult.data.length === 0) {
    return {
      success: false,
      count: 0,
      errors: parseResult.errors.length > 0
        ? parseResult.errors
        : [{ row: 0, message: '文件中没有有效数据' }],
    }
  }

  // 保存到数据库
  onProgress?.({
    stage: 'saving',
    current: 50,
    total: 100,
    message: `正在保存 ${parseResult.data.length} 条记录...`,
  })

  const db = getDatabase()
  const now = new Date()

  // --- 关键修复：导入不应清理旧数据，因为可能是多文件导入 ---
  // console.log(`[Import] 正在清理批次 ${batchId} 的旧发票数据...`)
  // await db.delete(invoices).where(eq(invoices.batchId, batchId))
  // ----------------------------------------------

  // --- 去重：按 invoiceNumber 或 sellerName+amount+date 去重 ---
  const invSeenKeys = new Set<string>()
  const uniqueInvData = parseResult.data.filter(item => {
    let key: string
    if (item.invoiceNumber) {
      key = `num:${item.invoiceNumber}`
    } else {
      const dateStr = item.invoiceDate
        ? item.invoiceDate.toISOString().split('T')[0]
        : ''
      key = `combo:${(item.sellerName || '').trim()}|${item.amount}|${dateStr}`
    }
    if (invSeenKeys.has(key)) return false
    invSeenKeys.add(key)
    return true
  })

  if (uniqueInvData.length !== parseResult.data.length) {
    console.log(`[Import] 发票去重: ${parseResult.data.length} -> ${uniqueInvData.length} (移除 ${parseResult.data.length - uniqueInvData.length} 条重复)`)
  }

  const records: NewInvoice[] = uniqueInvData.map((item) => ({
    id: uuidv4(),
    batchId,
    invoiceCode: item.invoiceCode,
    invoiceNumber: item.invoiceNumber,
    sellerName: item.sellerName,
    amount: item.amount,
    invoiceDate: item.invoiceDate,
    status: 'pending' as const,
    createdAt: now,
    buyerName: item.buyerName,
    buyerTaxId: item.buyerTaxId,
    sellerTaxId: item.sellerTaxId,
    taxAmount: item.taxAmount,
    taxRate: item.taxRate,
    itemName: item.itemNames,
    remark: item.remark,
    issuer: item.issuer,
    sourceFilePath: item.sourceFilePath || filePath,
  }))

  // 分批插入
  const BATCH_SIZE = 100
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    await db.insert(invoices).values(batch)

    onProgress?.({
      stage: 'saving',
      current: 50 + Math.floor((i / records.length) * 40),
      total: 100,
      message: `已保存 ${Math.min(i + BATCH_SIZE, records.length)} / ${records.length} 条`,
    })
  }

  // 更新批次统计
  const existingBatch = await getBatch(batchId)
  await updateBatchStatus(batchId, 'pending', {
    totalInvoiceCount: (existingBatch?.totalInvoiceCount || 0) + records.length,
    totalBankCount: existingBatch?.totalBankCount || 0,
  })

  onProgress?.({
    stage: 'done',
    current: 100,
    total: 100,
    message: `导入完成，共 ${records.length} 条记录`,
  })

  return {
    success: true,
    count: records.length,
    errors: parseResult.errors,
    batchId,
  }
}

// ============================================
// PDF 发票导入（含跨批次去重）
// ============================================

/**
 * PDF 发票导入结果
 */
export interface PdfImportResult {
  success: boolean
  imported: number
  skippedDuplicates: Array<{ invoiceNumber: string | null; fileName: string; reason: string }>
  errors: Array<{ row: number; message: string }>
  batchId?: string
}

/**
 * 导入 PDF 解析后的发票数据（含跨批次去重）
 *
 * 入库前检查数据库中是否已存在相同发票号码的记录，
 * 若 invoiceNumber 为空，则以 sellerName + amount + invoiceDate 组合查询去重。
 */
export async function importPdfInvoices(
  batchId: string,
  pdfInvoices: Array<{
    filePath: string
    fileName: string
    invoiceCode: string | null
    invoiceNumber: string | null
    invoiceDate: string | null
    buyerName: string | null
    buyerTaxId: string | null
    sellerName: string | null
    sellerTaxId: string | null
    amount: number | null
    taxAmount: number | null
    totalAmount: number | null
    taxRate: string | null
    invoiceType: string | null
    itemName: string | null
    parseSource: string
  }>,
  onProgress?: ImportProgressCallback
): Promise<PdfImportResult> {
  const result: PdfImportResult = {
    success: false,
    imported: 0,
    skippedDuplicates: [],
    errors: [],
    batchId,
  }

  if (pdfInvoices.length === 0) {
    result.errors.push({ row: 0, message: '没有可导入的发票数据' })
    return result
  }

  onProgress?.({
    stage: 'parsing',
    current: 10,
    total: 100,
    message: `正在进行跨批次去重检查（${pdfInvoices.length} 张发票）...`,
  })

  const db = getDatabase()
  const now = new Date()

  // ---- 批次内去重 ----
  // 仅查询当前批次内已有的发票记录用于去重（不跨批次，每个批次是独立对账单元）
  const existingInvoices = await db.select({
    invoiceNumber: invoices.invoiceNumber,
    sellerName: invoices.sellerName,
    amount: invoices.amount,
    invoiceDate: invoices.invoiceDate,
  }).from(invoices).where(eq(invoices.batchId, batchId))

  // 构建已有发票的去重键集合
  const existingKeys = new Set<string>()
  for (const inv of existingInvoices) {
    if (inv.invoiceNumber) {
      existingKeys.add(`num:${inv.invoiceNumber}`)
    } else {
      const seller = (inv.sellerName || '').trim()
      const amount = String(inv.amount ?? '')
      const date = inv.invoiceDate ? inv.invoiceDate.toISOString().split('T')[0] : ''
      existingKeys.add(`combo:${seller}|${amount}|${date}`)
    }
  }

  // 过滤掉数据库中已存在的发票
  const toImport: typeof pdfInvoices = []
  for (const inv of pdfInvoices) {
    let dedupKey: string
    if (inv.invoiceNumber) {
      dedupKey = `num:${inv.invoiceNumber}`
    } else {
      const seller = (inv.sellerName || '').trim()
      const amount = String(inv.totalAmount ?? inv.amount ?? '')
      const date = (inv.invoiceDate || '').trim()
      dedupKey = `combo:${seller}|${amount}|${date}`
    }

    if (existingKeys.has(dedupKey)) {
      result.skippedDuplicates.push({
        invoiceNumber: inv.invoiceNumber,
        fileName: inv.fileName || path.basename(inv.filePath),
        reason: '批次内重复',
      })
    } else {
      toImport.push(inv)
      existingKeys.add(dedupKey) // 防止本批次后续条目与已加入的重复
    }
  }

  if (toImport.length === 0) {
    result.success = true
    result.errors.push({ row: 0, message: `所有 ${pdfInvoices.length} 张发票均已存在，已全部跳过` })
    return result
  }

  // ---- 入库 ----
  onProgress?.({
    stage: 'saving',
    current: 50,
    total: 100,
    message: `正在保存 ${toImport.length} 条记录...`,
  })

  const records: NewInvoice[] = toImport.map((inv) => ({
    id: uuidv4(),
    batchId,
    invoiceCode: inv.invoiceCode,
    invoiceNumber: inv.invoiceNumber,
    sellerName: inv.sellerName || '未知销售方',
    amount: inv.totalAmount ?? inv.amount ?? 0,
    invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate) : null,
    status: 'pending' as const,
    createdAt: now,
    // 扩展字段
    buyerName: inv.buyerName,
    buyerTaxId: inv.buyerTaxId,
    sellerTaxId: inv.sellerTaxId,
    taxAmount: inv.taxAmount,
    taxRate: inv.taxRate,
    invoiceType: inv.invoiceType,
    itemName: inv.itemName,
    parseSource: inv.parseSource,
    sourceFilePath: inv.filePath,
  }))

  // 分批插入
  const BATCH_SIZE = 100
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const insertBatch = records.slice(i, i + BATCH_SIZE)
    await db.insert(invoices).values(insertBatch)

    onProgress?.({
      stage: 'saving',
      current: 50 + Math.floor((i / records.length) * 40),
      total: 100,
      message: `已保存 ${Math.min(i + BATCH_SIZE, records.length)} / ${records.length} 条`,
    })
  }

  // 更新批次统计
  const existingBatch = await getBatch(batchId)
  await updateBatchStatus(batchId, 'pending', {
    totalInvoiceCount: (existingBatch?.totalInvoiceCount || 0) + records.length,
    totalBankCount: existingBatch?.totalBankCount || 0,
  })

  onProgress?.({
    stage: 'done',
    current: 100,
    total: 100,
    message: `导入完成：成功 ${records.length} 张${result.skippedDuplicates.length > 0 ? `，跳过重复 ${result.skippedDuplicates.length} 张` : ''}`,
  })

  result.success = true
  result.imported = records.length
  return result
}

/**
 * 通过 AI 解析 PDF 发票
 * 需要 AI 服务配合使用
 */
export async function parsePdfInvoice(filePath: string): Promise<{
  success: boolean
  pdfText?: string
  error?: string
}> {
  try {
    const pdfText = await readPdfText(filePath)
    return { success: true, pdfText }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

// ============================================
// 付款人对应关系导入
// ============================================

/**
 * 导入付款人对应关系
 */
export async function importPayerMappings(
  filePath: string,
  onProgress?: ImportProgressCallback
): Promise<ImportResult> {
  onProgress?.({
    stage: 'reading',
    current: 0,
    total: 100,
    message: '正在读取文件...',
  })

  // 解析文件
  onProgress?.({
    stage: 'parsing',
    current: 10,
    total: 100,
    message: '正在解析数据...',
  })

  const parseResult = parsePayerMappings(filePath)

  if (parseResult.data.length === 0) {
    return {
      success: false,
      count: 0,
      errors: parseResult.errors.length > 0
        ? parseResult.errors
        : [{ row: 0, message: '文件中没有有效数据' }],
    }
  }

  // 保存到数据库
  onProgress?.({
    stage: 'saving',
    current: 40,
    total: 100,
    message: '正在验证重复数据...',
  })

  const db = getDatabase()
  const now = new Date()

  // 1. 获取现有映射，用于去重
  const existingMappings = await db.select().from(payerMappings)
  const existingSet = new Set(
    existingMappings.map(m => `${m.personName}|${m.companyName}`)
  )

  // 2. 过滤掉重复的记录
  const newRecords: NewPayerMapping[] = []

  for (const item of parseResult.data) {
    const key = `${item.personName}|${item.companyName}`
    if (!existingSet.has(key)) {
      newRecords.push({
        id: uuidv4(),
        personName: item.personName,
        companyName: item.companyName,
        accountSuffix: item.accountSuffix,
        remark: item.remark,
        source: 'imported' as const,
        createdAt: now,
      })
      // 添加到集合中，防止文件内部也有重复
      existingSet.add(key)
    }
  }

  if (newRecords.length === 0) {
    onProgress?.({
      stage: 'done',
      current: 100,
      total: 100,
      message: '所有数据已存在，无需导入',
    })
    return {
      success: true,
      count: 0,
      errors: [],
    }
  }

  onProgress?.({
    stage: 'saving',
    current: 60,
    total: 100,
    message: `正在保存 ${newRecords.length} 条新记录...`,
  })

  // 分批插入
  const BATCH_SIZE = 100
  for (let i = 0; i < newRecords.length; i += BATCH_SIZE) {
    const batch = newRecords.slice(i, i + BATCH_SIZE)
    await db.insert(payerMappings).values(batch)

    // 更新进度
    const progress = 60 + Math.floor((i / newRecords.length) * 40)
    onProgress?.({
      stage: 'saving',
      current: progress,
      total: 100,
      message: `已保存 ${Math.min(i + BATCH_SIZE, newRecords.length)} / ${newRecords.length} 条`,
    })
  }

  onProgress?.({
    stage: 'done',
    current: 100,
    total: 100,
    message: `导入完成，新增 ${newRecords.length} 条对应关系`,
  })

  return {
    success: true,
    count: newRecords.length,
    errors: parseResult.errors,
  }
}

/**
 * 获取所有付款人对应关系
 */
export async function getAllPayerMappings() {
  const db = getDatabase()
  return db.select().from(payerMappings)
}

/**
 * 添加付款人对应关系（手动或 AI 提取）
 */
export async function addPayerMapping(
  mapping: Omit<NewPayerMapping, 'id' | 'createdAt'>
): Promise<string> {
  const db = getDatabase()
  const id = uuidv4()

  await db.insert(payerMappings).values({
    id,
    ...mapping,
    createdAt: new Date(),
  })

  return id
}
