/**
 * 异常检测服务
 * 检测有水无票、重复支付、金额严重不符等异常情况
 */
import { and, eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/client'
import {
    bankTransactions,
    exceptions,
    invoices,
    matchResults,
    NewException,
} from '../database/schema'
import { sanitizeTransaction } from './sanitizationService'

// ============================================
// 类型定义
// ============================================

export type ExceptionType =
  | 'NO_INVOICE'        // 有水无票
  | 'NO_BANK_TXN'       // 有票无水
  | 'DUPLICATE_PAYMENT' // 重复支付
  | 'AMOUNT_MISMATCH'   // 金额严重不符
  | 'SUSPICIOUS_PROXY'  // 可疑代付

export type ExceptionSeverity = 'high' | 'medium' | 'low'

export interface DetectionResult {
  totalExceptions: number
  byType: Record<ExceptionType, number>
  bySeverity: Record<ExceptionSeverity, number>
}

export interface ExceptionRecord {
  id: string
  type: ExceptionType
  severity: ExceptionSeverity
  detail: any
  suggestion: string
}

// ============================================
// 异常检测逻辑
// ============================================

/**
 * 执行完整的异常检测
 */
export async function detectExceptions(batchId: string): Promise<DetectionResult> {
  console.log(`[Exception] 开始检测异常, batchId=${batchId}`)
  const db = getDatabase()

  // --- 关键重构：先清理，后探测，杜绝重复累加 ---
  // 1. 恢复流水和发票的状态位，防止状态机死锁
  await db.update(bankTransactions)
    .set({ status: 'pending' })
    .where(and(
      eq(bankTransactions.batchId, batchId),
      eq(bankTransactions.status, 'exception')
    ))

  await db.update(invoices)
    .set({ status: 'pending' })
    .where(and(
      eq(invoices.batchId, batchId),
      eq(invoices.status, 'exception')
    ))

  // 2. 物理删除所有未处理的系统异常（手动标记的保留）
  await db.delete(exceptions)
    .where(and(
      eq(exceptions.batchId, batchId),
      eq(exceptions.status, 'pending')
    ))
  console.log(`[Exception] 已执行旧异常记录清理`)
  // ----------------------------------------------

  const result: DetectionResult = {
    totalExceptions: 0,
    byType: {
      NO_INVOICE: 0,
      NO_BANK_TXN: 0,
      DUPLICATE_PAYMENT: 0,
      AMOUNT_MISMATCH: 0,
      SUSPICIOUS_PROXY: 0,
    },
    bySeverity: {
      high: 0,
      medium: 0,
      low: 0,
    },
  }

  // 1. 检测有水无票
  const noInvoiceCount = await detectNoInvoice(batchId)
  result.byType.NO_INVOICE = noInvoiceCount
  result.totalExceptions += noInvoiceCount

  // 2. 检测有票无水
  const noBankTxnCount = await detectNoBankTransaction(batchId)
  result.byType.NO_BANK_TXN = noBankTxnCount
  result.totalExceptions += noBankTxnCount

  // 3. 检测重复支付
  const duplicateCount = await detectDuplicatePayments(batchId)
  result.byType.DUPLICATE_PAYMENT = duplicateCount
  result.totalExceptions += duplicateCount

  // 4. 检测金额严重不符（已匹配但差异过大）
  const mismatchCount = await detectAmountMismatch(batchId)
  result.byType.AMOUNT_MISMATCH = mismatchCount
  result.totalExceptions += mismatchCount

  // 计算严重程度统计
  const allExceptions = await db.select()
    .from(exceptions)
    .where(eq(exceptions.batchId, batchId))

  for (const exc of allExceptions) {
    const sev = exc.severity as ExceptionSeverity
    result.bySeverity[sev] = (result.bySeverity[sev] || 0) + 1
  }

  console.log(`[Exception] 检测完成, 共发现 ${result.totalExceptions} 个异常`)

  return result
}

/**
 * 检测有水无票：银行流水未匹配且无对应发票
 */
async function detectNoInvoice(batchId: string): Promise<number> {
  const db = getDatabase()

  // 获取所有未匹配的银行流水
  const unmatchedBank = await db.select()
    .from(bankTransactions)
    .where(and(
      eq(bankTransactions.batchId, batchId),
      eq(bankTransactions.status, 'pending')
    ))

  let count = 0
  const now = new Date()

  for (const tx of unmatchedBank) {
    // 既然在开始已经清理了 pending，这里就不再检查 existing，直接插入以保证实时性
    const severity: ExceptionSeverity = tx.amount > 10000 ? 'high' : tx.amount > 1000 ? 'medium' : 'low'

    const exception: NewException = {
      id: uuidv4(),
      batchId,
      type: 'NO_INVOICE',
      severity,
      relatedBankId: tx.id,
      relatedInvoiceId: null,
      detail: JSON.stringify({
        transactionDate: tx.transactionDate,
        payerName: tx.payerName,
        amount: tx.amount,
        remark: tx.remark,
      }),
      suggestion: `请核实该笔收入 ¥${tx.amount} 是否需要开具发票，或检查发票是否已导入。`,
      status: 'pending',
      createdAt: now,
    }

    await db.insert(exceptions).values(exception)

    // 更新银行流水状态为异常
    await db.update(bankTransactions)
      .set({ status: 'exception' })
      .where(eq(bankTransactions.id, tx.id))

    count++
  }

  console.log(`[Exception] 有水无票: ${count} 条`)
  return count
}

/**
 * 检测有票无水：发票未匹配且无对应银行流水
 */
async function detectNoBankTransaction(batchId: string): Promise<number> {
  const db = getDatabase()

  const unmatchedInvoices = await db.select()
    .from(invoices)
    .where(and(
      eq(invoices.batchId, batchId),
      eq(invoices.status, 'pending')
    ))

  let count = 0
  const now = new Date()

  for (const inv of unmatchedInvoices) {
    const severity: ExceptionSeverity = inv.amount > 10000 ? 'high' : inv.amount > 1000 ? 'medium' : 'low'

    const exception: NewException = {
      id: uuidv4(),
      batchId,
      type: 'NO_BANK_TXN',
      severity,
      relatedBankId: null,
      relatedInvoiceId: inv.id,
      detail: JSON.stringify({
        invoiceCode: inv.invoiceCode,
        invoiceNumber: inv.invoiceNumber,
        sellerName: inv.sellerName,
        amount: inv.amount,
        invoiceDate: inv.invoiceDate,
        sourceFilePath: inv.sourceFilePath,
      }),
      suggestion: `发票 ¥${inv.amount} 未找到对应银行流水，请确认款项是否已到账。`,
      status: 'pending',
      createdAt: now,
    }

    await db.insert(exceptions).values(exception)

    await db.update(invoices)
      .set({ status: 'exception' })
      .where(eq(invoices.id, inv.id))

    count++
  }

  console.log(`[Exception] 有票无水: ${count} 条`)
  return count
}

/**
 * 检测重复支付：同一付款人、相近金额、相近日期的多笔流水
 */
async function detectDuplicatePayments(batchId: string): Promise<number> {
  const db = getDatabase()

  // 查找同一付款人、相同金额的流水
  const allBank = await db.select()
    .from(bankTransactions)
    .where(eq(bankTransactions.batchId, batchId))

  const grouped: Record<string, typeof allBank> = {}

  for (const tx of allBank) {
    // 用 付款人+金额 作为 key
    const key = `${tx.payerName}_${tx.amount.toFixed(2)}`
    if (!grouped[key]) {
      grouped[key] = []
    }
    grouped[key].push(tx)
  }

  let count = 0
  const now = new Date()

  for (const [_key, txList] of Object.entries(grouped)) {
    if (txList.length < 2) continue

    // 检查日期是否相近（7天内）
    const sortedByDate = txList.sort((a, b) => {
      const dateA = a.transactionDate?.getTime() || 0
      const dateB = b.transactionDate?.getTime() || 0
      return dateA - dateB
    })

    for (let i = 1; i < sortedByDate.length; i++) {
      const prev = sortedByDate[i - 1]
      const curr = sortedByDate[i]

      const prevTime = prev.transactionDate?.getTime() || 0
      const currTime = curr.transactionDate?.getTime() || 0
      const daysDiff = (currTime - prevTime) / (1000 * 60 * 60 * 24)

      if (daysDiff <= 7) {
        // 直接插入，不再检查 existing
        const exception: NewException = {
          id: uuidv4(),
          batchId,
          type: 'DUPLICATE_PAYMENT',
          severity: 'high',
          relatedBankId: curr.id,
          relatedInvoiceId: null,
          detail: JSON.stringify({
            currentTx: {
              id: curr.id,
              date: curr.transactionDate,
              amount: curr.amount,
              payer: curr.payerName,
            },
            previousTx: {
              id: prev.id,
              date: prev.transactionDate,
              amount: prev.amount,
              payer: prev.payerName,
            },
            daysDiff: daysDiff.toFixed(1),
          }),
          suggestion: `发现疑似重复支付：${curr.payerName} 在 ${daysDiff.toFixed(0)} 天内支付了两笔 ¥${curr.amount}，请核实。`,
          status: 'pending',
          createdAt: now,
        }

        await db.insert(exceptions).values(exception)
        count++
      }
    }
  }

  console.log(`[Exception] 重复支付疑似: ${count} 条`)
  return count
}

/**
 * 检测金额严重不符：已匹配但差异超过阈值
 */
async function detectAmountMismatch(batchId: string): Promise<number> {
  const db = getDatabase()

  // 获取所有匹配结果以及对应的发票
  const matches = await db.select({
    match: matchResults,
    invoice: invoices,
  })
    .from(matchResults)
    .leftJoin(invoices, eq(matchResults.invoiceId, invoices.id))
    .where(eq(matchResults.batchId, batchId))

  let count = 0
  const now = new Date()
  const MISMATCH_THRESHOLD = 100 // 差异超过 100 元视为严重不符

  for (const row of matches) {
    const { match, invoice } = row
    const diff = Math.abs(match.amountDiff || 0)

    if (diff > MISMATCH_THRESHOLD) {
      const severity: ExceptionSeverity = diff > 500 ? 'high' : diff > 200 ? 'medium' : 'low'

      const exception: NewException = {
        id: uuidv4(),
        batchId,
        type: 'AMOUNT_MISMATCH',
        severity,
        relatedBankId: match.bankId,
        relatedInvoiceId: match.invoiceId,
        detail: JSON.stringify({
          matchId: match.id,
          matchType: match.matchType,
          amountDiff: match.amountDiff,
          reason: match.reason,
          sourceFilePath: invoice?.sourceFilePath,
        }),
        suggestion: `匹配金额差异 ¥${diff.toFixed(2)} 超过阈值，请人工复核。`,
        status: 'pending',
        createdAt: now,
      }

      await db.insert(exceptions).values(exception)
      count++
    }
  }

  console.log(`[Exception] 金额严重不符: ${count} 条`)
  return count
}

// ============================================
// 异常处理
// ============================================

/**
 * 获取批次的所有异常（含关联发票的 sourceFilePath）
 */
export async function getExceptions(batchId: string, status?: string) {
  const db = getDatabase()

  const baseQuery = db
    .select({
      id: exceptions.id,
      batchId: exceptions.batchId,
      type: exceptions.type,
      severity: exceptions.severity,
      relatedBankId: exceptions.relatedBankId,
      relatedInvoiceId: exceptions.relatedInvoiceId,
      detail: exceptions.detail,
      suggestion: exceptions.suggestion,
      status: exceptions.status,
      resolution: exceptions.resolution,
      resolvedAt: exceptions.resolvedAt,
      createdAt: exceptions.createdAt,
      invoiceSourceFilePath: invoices.sourceFilePath,
    })
    .from(exceptions)
    .leftJoin(invoices, eq(exceptions.relatedInvoiceId, invoices.id))

  if (status) {
    return baseQuery.where(and(
      eq(exceptions.batchId, batchId),
      eq(exceptions.status, status as any)
    ))
  }

  return baseQuery.where(eq(exceptions.batchId, batchId))
}

/**
 * 使用 AI 诊断异常信息
 */
export async function diagnoseExceptionsWithAI(
  batchId: string,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<void> {
  const db = getDatabase()
  const ai = (await import('./aiService')).aiService

  // 获取所有待处理的异常
  const pendingExceptions = await db.select()
    .from(exceptions)
    .where(and(
      eq(exceptions.batchId, batchId),
      eq(exceptions.status, 'pending')
    ))

  if (pendingExceptions.length === 0) return

  console.log(`[Exception AI] 开始诊断 ${pendingExceptions.length} 个异常`)

  // 为了性能和费用，仅诊断前 50 个最严重的异常
  const toProcess = pendingExceptions.slice(0, 50)

  for (let i = 0; i < toProcess.length; i++) {
    const exc = toProcess[i]
    onProgress?.(i + 1, toProcess.length, `正在 AI 诊断异常 ${i + 1}/${toProcess.length}...`)

    try {
      const detail = JSON.parse(exc.detail || '{}')

      const prompt = `
      You are a senior financial auditor. Analyze this accounting exception and provide a diagnosis and recommended action.

      Exception Type: ${exc.type}
      Severity: ${exc.severity}
      Context Data:
      ${JSON.stringify(sanitizeTransaction(detail), null, 2)}

      Task:
      1. Diagnosis: Explain why this might have happened (e.g., missing invoice, wrong amount, timing difference, potential duplicate).
      2. Suggestion: What the user should do next to resolve it.

      Output JSON:
      {
        "diagnosis": "Chinese diagnosis string",
        "suggestion": "Chinese suggestion string"
      }
      `

      const result = await ai.getJSON<{ diagnosis: string; suggestion: string }>(
        "Diagnose financial reconciliation exception",
        prompt,
        0.3
      )

      if (result.diagnosis && result.suggestion) {
        // 更新异常信息
        // 将诊断结果存入 detail 字段，并更新核心 suggestion
        const updatedDetail = { ...detail, diagnosis: result.diagnosis }

        await db.update(exceptions)
          .set({
            detail: JSON.stringify(updatedDetail),
            suggestion: result.suggestion
          })
          .where(eq(exceptions.id, exc.id))
      }

    } catch (error) {
      console.error(`[Exception AI] Failed to diagnose ${exc.id}:`, error)
    }
  }
}

/**
 * 解决异常
 */
export async function resolveException(
  exceptionId: string,
  resolution: 'resolved' | 'ignored',
  note?: string
): Promise<void> {
  const db = getDatabase()

  await db.update(exceptions)
    .set({
      status: resolution,
      resolution: note || null,
      resolvedAt: new Date(),
    })
    .where(eq(exceptions.id, exceptionId))

  console.log(`[Exception] 异常已处理: ${exceptionId} -> ${resolution}`)
}
