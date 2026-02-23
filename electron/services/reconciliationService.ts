/**
 * 核销编排服务
 * 协调整个核销流程
 */
import { and, eq, ne } from 'drizzle-orm'
import { getDatabase } from '../database/client'
import {
  bankTransactions,
  exceptions,
  invoices,
  matchResults,
  reconciliationBatches,
  reports,
} from '../database/schema'
import { executeAIMatching } from './aiMatchingService'
import { archiveBatch } from './archiveService'
import { updateBatchStatus } from './importService'
import { executeRuleMatching, getMatchingStats, MatchingStats } from './matchingService'
import { clearStopFlag, isStopped } from './taskService'

// ============================================
// 类型定义
// ============================================

/**
 * 核销阶段
 */
export type ReconciliationStage =
  | 'idle'

  | 'rule_matching'
  | 'ai_matching'
  | 'exception_detection'
  | 'completed'
  | 'failed'
  | 'unbalanced'
  | 'archived'

/**
 * 核销进度
 */
export interface ReconciliationProgress {
  stage: ReconciliationStage
  percentage: number
  message: string
  stats?: MatchingStats
}

/**
 * 核销配置
 */
export interface ReconciliationConfig {
  enableAI: boolean
  toleranceAmount: number
  skipExceptionDetection: boolean
}

/**
 * 核销结果
 */
export interface ReconciliationResult {
  success: boolean
  batchId: string
  stats: MatchingStats
  duration: number
  error?: string
}

/**
 * 进度回调
 */
export type ReconciliationProgressCallback = (progress: ReconciliationProgress) => void

// ============================================
// 默认配置
// ============================================

const DEFAULT_CONFIG: ReconciliationConfig = {
  enableAI: true,
  toleranceAmount: 20,
  skipExceptionDetection: false,
}

// ============================================
// 核销流程编排
// ============================================

// ⚠️ 并发锁：防止同一批次被同时执行两次核销（React StrictMode / 双击 等场景）
const runningBatches = new Set<string>()

/**
 * 执行完整核销流程
 */
export async function executeReconciliation(
  batchId: string,
  config: Partial<ReconciliationConfig> = {},
  onProgress?: ReconciliationProgressCallback
): Promise<ReconciliationResult> {
  // 并发锁检查：同一 batchId 不允许并发执行
  if (runningBatches.has(batchId)) {
    console.warn(`[Reconciliation] ⚠️ 批次 ${batchId} 已在执行中，忽略重复调用`)
    return {
      success: false,
      batchId,
      stats: { perfectCount: 0, toleranceCount: 0, proxyCount: 0, aiCount: 0, remainingBankCount: 0, remainingInvoiceCount: 0, duration: 0 },
      duration: 0,
      error: '该批次正在核销中，请勿重复提交',
    }
  }
  runningBatches.add(batchId)

  const startTime = Date.now()
  const finalConfig = { ...DEFAULT_CONFIG, ...config }

  console.log(`[Reconciliation] 开始核销流程, batchId=${batchId}`)

  // 开始前清除停止标记
  clearStopFlag(batchId)

  // ============================================
  // 清理旧数据，防止重跑时数据重复累加
  // ============================================
  const db = getDatabase()

  // 1. 删除旧匹配结果
  await db.delete(matchResults)
    .where(eq(matchResults.batchId, batchId))
  console.log(`[Reconciliation] 已清理旧匹配结果`)

  // 2. 重置所有银行流水状态为 pending
  await db.update(bankTransactions)
    .set({ status: 'pending' })
    .where(and(
      eq(bankTransactions.batchId, batchId),
      ne(bankTransactions.status, 'pending')
    ))

  // 3. 重置所有发票状态为 pending
  await db.update(invoices)
    .set({ status: 'pending' })
    .where(and(
      eq(invoices.batchId, batchId),
      ne(invoices.status, 'pending')
    ))

  // 4. 删除旧异常记录
  await db.delete(exceptions)
    .where(eq(exceptions.batchId, batchId))

  // 5. 删除旧报告记录
  await db.delete(reports)
    .where(eq(reports.batchId, batchId))

  console.log(`[Reconciliation] 旧数据清理完成`)

  // ============================================
  // 源数据去重：删除导入时产生的重复银行流水和发票
  // ============================================
  try {

    // 去重银行流水: 按 payerName + amount + transactionDate 分组（忽略 remark 差异）
    const allBankTxns = await db.select({
      id: bankTransactions.id,
      payerName: bankTransactions.payerName,
      amount: bankTransactions.amount,
      transactionDate: bankTransactions.transactionDate,
    }).from(bankTransactions)
      .where(eq(bankTransactions.batchId, batchId))

    console.log(`[Reconciliation] 银行流水总数: ${allBankTxns.length}`)

    const bankSeenKeys = new Map<string, string>() // key -> first id
    const bankDupIds: string[] = []
    for (const tx of allBankTxns) {
      const dateStr = tx.transactionDate
        ? new Date(tx.transactionDate).toISOString().split('T')[0]
        : ''
      const key = `${(tx.payerName || '').trim()}|${tx.amount}|${dateStr}`
      if (bankSeenKeys.has(key)) {
        bankDupIds.push(tx.id)
      } else {
        bankSeenKeys.set(key, tx.id)
      }
    }

    if (bankDupIds.length > 0) {
      for (const dupId of bankDupIds) {
        await db.delete(bankTransactions).where(eq(bankTransactions.id, dupId))
      }
      console.log(`[Reconciliation] 银行流水去重: 删除 ${bankDupIds.length} 条重复记录 (${allBankTxns.length} -> ${allBankTxns.length - bankDupIds.length})`)
    }

    // 去重发票: 按 invoiceNumber 或 sellerName+amount+invoiceDate 分组
    const allInvoices = await db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      sellerName: invoices.sellerName,
      amount: invoices.amount,
      invoiceDate: invoices.invoiceDate,
    }).from(invoices)
      .where(eq(invoices.batchId, batchId))

    console.log(`[Reconciliation] 发票总数: ${allInvoices.length}`)

    const invSeenKeys = new Map<string, string>()
    const invDupIds: string[] = []
    for (const inv of allInvoices) {
      let key: string
      if (inv.invoiceNumber) {
        key = `num:${inv.invoiceNumber}`
      } else {
        const dateStr = inv.invoiceDate
          ? new Date(inv.invoiceDate).toISOString().split('T')[0]
          : ''
        key = `combo:${(inv.sellerName || '').trim()}|${inv.amount}|${dateStr}`
      }
      if (invSeenKeys.has(key)) {
        invDupIds.push(inv.id)
      } else {
        invSeenKeys.set(key, inv.id)
      }
    }

    if (invDupIds.length > 0) {
      for (const dupId of invDupIds) {
        await db.delete(invoices).where(eq(invoices.id, dupId))
      }
      console.log(`[Reconciliation] 发票去重: 删除 ${invDupIds.length} 条重复记录 (${allInvoices.length} -> ${allInvoices.length - invDupIds.length})`)
    }

    if (bankDupIds.length === 0 && invDupIds.length === 0) {
      console.log(`[Reconciliation] 源数据无重复`)
    }
  } catch (dedupError) {
    console.error('[Reconciliation] 源数据去重失败:', dedupError)
    // 不阻塞核销流程
  }

  console.log(`[Reconciliation] 开始全新核销`)

  try {
    let finalStats: MatchingStats
    // 阶段 1: 规则匹配
    if (isStopped(batchId)) throw new Error('任务被用户停止')
    onProgress?.({
      stage: 'rule_matching',
      percentage: 10,
      message: '正在执行规则匹配...',
    })

    const ruleMatchStats = await executeRuleMatching(batchId, (progress) => {
      const basePercentage = 10
      const stagePercentage = 40  // 规则匹配占 40%
      const levelPercentage = Math.floor((progress.current / progress.total) * stagePercentage)

      onProgress?.({
        stage: 'rule_matching',
        percentage: basePercentage + levelPercentage,
        message: progress.message,
        stats: {
          perfectCount: progress.matchedCount,
          toleranceCount: 0,
          proxyCount: 0,
          aiCount: 0,
          remainingBankCount: progress.total - progress.matchedCount,
          remainingInvoiceCount: 0,
          duration: 0,
        },
      })
    })

    console.log(`[Reconciliation] 规则匹配完成: ${ruleMatchStats.perfectCount + ruleMatchStats.toleranceCount + ruleMatchStats.proxyCount} 条匹配`)

    if (isStopped(batchId)) throw new Error('任务被用户停止')

    // 阶段 2: AI 匹配（如果启用且有剩余）
    let aiMatchStats: MatchingStats | null = null
    if (finalConfig.enableAI && (ruleMatchStats.remainingBankCount > 0 || ruleMatchStats.remainingInvoiceCount > 0)) {
      onProgress?.({
        stage: 'ai_matching',
        percentage: 50,
        message: '正在执行 AI 语义匹配...',
        stats: ruleMatchStats,
      })

      aiMatchStats = await executeAIMatching(batchId, (progress) => {
        const basePercentage = 50
        const stagePercentage = 30 // AI 匹配占 30%
        const levelPercentage = Math.floor((progress.current / progress.total) * stagePercentage)

        onProgress?.({
          stage: 'ai_matching',
          percentage: basePercentage + levelPercentage,
          message: progress.message,
          stats: {
            ...ruleMatchStats,
            aiCount: progress.matchedCount,
            remainingBankCount: ruleMatchStats.remainingBankCount - progress.matchedCount,
            remainingInvoiceCount: ruleMatchStats.remainingInvoiceCount - progress.matchedCount,
          }
        })
      })

      console.log(`[Reconciliation] AI 匹配完成: ${aiMatchStats?.aiCount || 0} 条匹配`)
    }

    if (isStopped(batchId)) throw new Error('任务被用户停止')

    let totalExceptions = 0

    // 阶段 3: 异常检测
    if (!finalConfig.skipExceptionDetection) {
      onProgress?.({
        stage: 'exception_detection',
        percentage: 80,
        message: '正在检测异常...',
        stats: aiMatchStats || ruleMatchStats,
      })

      const { detectExceptions, diagnoseExceptionsWithAI } = await import('./exceptionService')
      const exceptionResult = await detectExceptions(batchId)
      totalExceptions = exceptionResult.totalExceptions

      console.log(`[Reconciliation] 异常检测完成: ${totalExceptions} 个异常`)

      // 完成
      finalStats = await getMatchingStats(batchId) // Assign finalStats here

      // 阶段 3.5: AI 异常诊断分析
      if (totalExceptions > 0 && finalConfig.enableAI) {
        onProgress?.({
          stage: 'exception_detection',
          percentage: 90,
          message: '正在使用 AI 诊断异常项...',
          stats: finalStats,
        })
        await diagnoseExceptionsWithAI(batchId, (current, total, message) => {
          onProgress?.({
            stage: 'exception_detection',
            percentage: 90 + Math.floor((current / total) * 9),
            message: `[AI 诊断] ${message}`,
            stats: finalStats,
          })
        })
      }
    } else {
      // If exception detection is skipped, finalStats should still be calculated
      finalStats = await getMatchingStats(batchId)
    }

    // 只有当完全匹配时才标记为 completed，否则为 unbalanced
    const isBalanced = finalStats.remainingBankCount === 0 && finalStats.remainingInvoiceCount === 0
    const finalStatus = isBalanced ? 'completed' : 'unbalanced'

    await updateBatchStatus(batchId, finalStatus, {
      matchedCount: finalStats.perfectCount + finalStats.toleranceCount + finalStats.proxyCount + finalStats.aiCount,
      unmatchedCount: finalStats.remainingBankCount + finalStats.remainingInvoiceCount,
      exceptionCount: totalExceptions,
    })

    const duration = Date.now() - startTime

    onProgress?.({
      stage: finalStatus,
      percentage: 100,
      message: isBalanced ? '核销完成' : '核销完成（未平账）',
      stats: finalStats,
    })

    // 自动生成报告 + 归档
    try {
      const { configStore } = await import('../config/store')
      const workspaceFolder = configStore.get('workspaceFolder')
      if (workspaceFolder) {
        const fsModule = await import('node:fs')
        const pathModule = await import('node:path')
        const { getBankStatementPath, getInvoicePath, ARCHIVE_SUB_DIRS } = await import('../utils/workspacePaths')

        // 先检查源文件夹是否有文件需要归档
        const bankFolder = getBankStatementPath(workspaceFolder)
        const invoiceFolder = getInvoicePath(workspaceFolder)
        const supportedExts = ['.xlsx', '.xls', '.csv', '.pdf']

        const countFiles = (folder: string): number => {
          if (!fsModule.existsSync(folder)) return 0
          return fsModule.readdirSync(folder).filter((f: string) => {
            if (f.startsWith('.') || f.startsWith('~$')) return false
            return supportedExts.includes(pathModule.extname(f).toLowerCase())
          }).length
        }

        const bankFileCount = countFiles(bankFolder)
        const invoiceFileCount = countFiles(invoiceFolder)
        const totalSourceFiles = bankFileCount + invoiceFileCount

        if (totalSourceFiles === 0) {
          console.log(`[Reconciliation] 源文件夹为空（已归档或无文件），跳过归档步骤`)
          // 仍然生成报告到默认导出目录
          const { generateReports } = await import('./reportService')
          await generateReports({ batchId })
          console.log(`[Reconciliation] 报告已生成到默认导出目录`)
        } else {
          // 有源文件，创建归档目录并归档
          const { getNextArchiveDir, createArchiveSubDirs } = await import('./folderService')
          const archiveInfo = getNextArchiveDir(workspaceFolder)
          createArchiveSubDirs(archiveInfo.dirPath)

          // 自动生成报告到归档目录
          const reportDir = pathModule.join(archiveInfo.dirPath, ARCHIVE_SUB_DIRS.AI_REPORTS)
          const { generateReports } = await import('./reportService')

          console.log(`[Reconciliation] 发现 ${totalSourceFiles} 个源文件（银行:${bankFileCount} 发票:${invoiceFileCount}），开始归档...`)
          console.log(`[Reconciliation] 开始生成报告到: ${reportDir}`)
          await generateReports({
            batchId,
            outputDir: reportDir,
            archiveDirName: archiveInfo.dirName,
          })

          // 调用统一的归档服务进行文件移动和状态更新
          console.log(`[Reconciliation] 开始归档原始文件...`)
          const archiveResult = await archiveBatch(batchId, archiveInfo)

          if (archiveResult.success) {
            console.log(`[Reconciliation] 自动归档完成，移动 ${archiveResult.movedFilesCount} 个文件到 ${archiveInfo.dirName}`)
          } else {
            console.error(`[Reconciliation] 归档过程发生错误: ${archiveResult.error}`)
          }
        }
      }
    } catch (archiveError) {
      console.error('[Reconciliation] 自动归档/报告生成失败:', archiveError)
      // 不影响对账结果
    }

    console.log(`[Reconciliation] 核销流程完成, 耗时 ${duration}ms`)

    runningBatches.delete(batchId) // 释放并发锁
    return {
      success: true,
      batchId,
      stats: finalStats,
      duration,
    }

  } catch (error) {
    console.error(`[Reconciliation] 核销流程失败:`, error)

    await updateBatchStatus(batchId, 'failed')

    onProgress?.({
      stage: 'failed',
      percentage: 0,
      message: `核销失败: ${error}`,
    })

    runningBatches.delete(batchId) // 释放并发锁
    return {
      success: false,
      batchId,
      stats: {
        perfectCount: 0,
        toleranceCount: 0,
        proxyCount: 0,
        aiCount: 0,
        remainingBankCount: 0,
        remainingInvoiceCount: 0,
        duration: Date.now() - startTime,
      },
      duration: Date.now() - startTime,
      error: String(error),
    }
  }
}

/**
 * 获取批次当前状态
 */
export async function getBatchStatus(batchId: string): Promise<{
  stage: ReconciliationStage
  stats: MatchingStats | null
}> {
  const db = getDatabase()

  const batch = await db.select()
    .from(reconciliationBatches)
    .where(eq(reconciliationBatches.id, batchId))
    .limit(1)

  if (!batch[0]) {
    return { stage: 'idle', stats: null }
  }

  const status = batch[0].status as ReconciliationStage

  if (status === 'completed' || status === 'failed' || status === 'unbalanced') {
    const stats = await getMatchingStats(batchId)
    return { stage: status, stats }
  }

  return { stage: status, stats: null }
}

/**
 * 重置批次（清除匹配结果，重新开始）
 */
export async function resetBatch(batchId: string): Promise<void> {
  const db = getDatabase()

  // 更新批次状态
  await db.update(reconciliationBatches)
    .set({
      status: 'pending',
      matchedCount: 0,
      unmatchedCount: 0,
      tokensUsed: 0,
      completedAt: null,
    })
    .where(eq(reconciliationBatches.id, batchId))

  // TODO: 清除匹配结果和异常记录

  console.log(`[Reconciliation] 批次已重置: ${batchId}`)
}
