/**
 * 核销编排服务
 * 协调整个核销流程
 */
import { eq } from 'drizzle-orm'
import { getDatabase } from '../database/client'
import { reconciliationBatches } from '../database/schema'
import { executeAIMatching } from './aiMatchingService'
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

/**
 * 执行完整核销流程
 */
export async function executeReconciliation(
  batchId: string,
  config: Partial<ReconciliationConfig> = {},
  onProgress?: ReconciliationProgressCallback
): Promise<ReconciliationResult> {
  const startTime = Date.now()
  const finalConfig = { ...DEFAULT_CONFIG, ...config }

  console.log(`[Reconciliation] 开始核销流程, batchId=${batchId}`)

  // 开始前清除停止标记
  clearStopFlag(batchId)

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
        const { getNextArchiveDir, createArchiveSubDirs } = await import('./folderService')
        const { ARCHIVE_SUB_DIRS, getBankStatementPath, getInvoicePath } = await import('../utils/workspacePaths')
        const archiveInfo = getNextArchiveDir(workspaceFolder)
        createArchiveSubDirs(archiveInfo.dirPath)

        // 自动生成报告到归档目录
        const reportDir = (await import('path')).join(archiveInfo.dirPath, ARCHIVE_SUB_DIRS.AI_REPORTS)
        const { generateReports } = await import('./reportService')
        await generateReports({
          batchId,
          outputDir: reportDir,
          archiveDirName: archiveInfo.dirName,
        })
        console.log(`[Reconciliation] 报告已自动生成到: ${reportDir}`)

        // 移动源文件到归档
        const fsModule = await import('fs')
        const pathModule = await import('path')
        const bankFolder = getBankStatementPath(workspaceFolder)
        const invoiceFolder = getInvoicePath(workspaceFolder)

        const moveFilesFromTo = (src: string, dest: string) => {
          if (!fsModule.existsSync(src)) return
          const files = fsModule.readdirSync(src)
          for (const file of files) {
            if (file.startsWith('~$') || file.startsWith('.')) continue
            const ext = pathModule.extname(file).toLowerCase()
            if (['.xlsx', '.xls', '.csv', '.pdf'].includes(ext)) {
              try {
                fsModule.renameSync(
                  pathModule.join(src, file),
                  pathModule.join(dest, file)
                )
              } catch (e) {
                console.error(`[Reconciliation] 移动文件失败: ${file}`, e)
              }
            }
          }
        }

        moveFilesFromTo(bankFolder, pathModule.join(archiveInfo.dirPath, ARCHIVE_SUB_DIRS.BANK_STATEMENTS))
        moveFilesFromTo(invoiceFolder, pathModule.join(archiveInfo.dirPath, ARCHIVE_SUB_DIRS.INVOICES))
        console.log(`[Reconciliation] 源文件已归档到: ${archiveInfo.dirPath}`)
      }
    } catch (archiveError) {
      console.error('[Reconciliation] 自动归档/报告生成失败:', archiveError)
      // 不影响对账结果
    }

    console.log(`[Reconciliation] 核销流程完成, 耗时 ${duration}ms`)

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
