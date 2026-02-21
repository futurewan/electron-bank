/**
 * 核销 IPC 处理器
 * 处理渲染进程的核销操作请求
 */
import { app, BrowserWindow, dialog, ipcMain, IpcMainInvokeEvent } from 'electron'
import * as path from 'path'
import * as XLSX from 'xlsx'
import {
  archiveBatch
} from '../../services/archiveService'
import { detectExceptions, getExceptions, resolveException } from '../../services/exceptionService'
import {
  addPayerMapping,
  createBatch,
  deleteBatch,
  getAllBatches,
  getAllPayerMappings,
  getBatch,
  importBankTransactions,
  importInvoices,
  importPayerMappings,
  importPdfInvoices,
  parsePdfInvoice,
} from '../../services/importService'
import {
  aggregateByPayer,
  batchAddMappings,
  deleteMapping,
  detectProxyPayments,
  getAllMappings,
  getSellerSuggestions,
  updateMapping,
  type NewMappingInput
} from '../../services/mappingService'
import {
  getMatchingStats,
  getMatchResults,
  confirmMatch,
} from '../../services/matchingService'
import { executeReconciliation } from '../../services/reconciliationService'
import { getReports, getReportsByBatchId } from '../../services/reportService'
import { requestStop } from '../../services/taskService'
import { RECONCILIATION_CHANNELS } from '../channels'

// ============================================
// 参数类型定义
// ============================================

interface CreateBatchParams {
  name: string
}

interface GetBatchParams {
  batchId: string
}

interface DeleteBatchParams {
  batchId: string
}

interface ImportBankTransactionsParams {
  batchId: string
  filePath: string
}

interface ImportInvoicesParams {
  batchId: string
  filePath: string
}

interface ImportPayerMappingsParams {
  filePath: string
}

interface ParsePdfInvoiceParams {
  filePath: string
}

interface AddPayerMappingParams {
  personName: string
  companyName: string
  accountSuffix?: string
  remark?: string
  source?: 'manual' | 'ai_extracted' | 'imported'
}

// ============================================
// 进度推送辅助函数
// ============================================

function sendProgress(channel: string, data: any) {
  const windows = BrowserWindow.getAllWindows()
  windows.forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  })
}

// ============================================
// 批次管理处理器
// ============================================

/**
 * 创建核销批次
 */
async function handleCreateBatch(_event: IpcMainInvokeEvent, params: CreateBatchParams) {
  try {
    const batchId = await createBatch(params.name)
    return { success: true, batchId }
  } catch (error) {
    console.error('[Reconciliation] Create batch error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 获取批次信息
 */
async function handleGetBatch(_event: IpcMainInvokeEvent, params: GetBatchParams) {
  try {
    const batch = await getBatch(params.batchId)
    return { success: true, batch }
  } catch (error) {
    console.error('[Reconciliation] Get batch error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 获取所有批次
 */
async function handleGetAllBatches() {
  try {
    const batches = await getAllBatches()
    return { success: true, batches }
  } catch (error) {
    console.error('[Reconciliation] Get all batches error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 删除批次
 */
async function handleDeleteBatch(_event: IpcMainInvokeEvent, params: DeleteBatchParams) {
  try {
    await deleteBatch(params.batchId)
    return { success: true }
  } catch (error) {
    console.error('[Reconciliation] Delete batch error:', error)
    return { success: false, error: String(error) }
  }
}

// ============================================
// 数据导入处理器
// ============================================

/**
 * 导入银行流水
 */
async function handleImportBankTransactions(
  _event: IpcMainInvokeEvent,
  params: ImportBankTransactionsParams
) {
  try {
    const result = await importBankTransactions(
      params.batchId,
      params.filePath,
      (progress) => {
        sendProgress(RECONCILIATION_CHANNELS.PROGRESS, {
          type: 'import_bank',
          batchId: params.batchId,
          ...progress,
        })
      }
    )
    return result
  } catch (error) {
    console.error('[Reconciliation] Import bank transactions error:', error)
    return { success: false, count: 0, errors: [{ row: 0, message: String(error) }] }
  }
}

/**
 * 导入发票
 */
async function handleImportInvoices(
  _event: IpcMainInvokeEvent,
  params: ImportInvoicesParams
) {
  try {
    const result = await importInvoices(
      params.batchId,
      params.filePath,
      (progress) => {
        sendProgress(RECONCILIATION_CHANNELS.PROGRESS, {
          type: 'import_invoice',
          batchId: params.batchId,
          ...progress,
        })
      }
    )
    return result
  } catch (error) {
    console.error('[Reconciliation] Import invoices error:', error)
    return { success: false, count: 0, errors: [{ row: 0, message: String(error) }] }
  }
}

/**
 * 导入付款人对应关系
 */
async function handleImportPayerMappings(
  _event: IpcMainInvokeEvent,
  params: ImportPayerMappingsParams
) {
  try {
    const result = await importPayerMappings(
      params.filePath,
      (progress) => {
        sendProgress(RECONCILIATION_CHANNELS.PROGRESS, {
          type: 'import_mappings',
          ...progress,
        })
      }
    )
    return result
  } catch (error) {
    console.error('[Reconciliation] Import payer mappings error:', error)
    return { success: false, count: 0, errors: [{ row: 0, message: String(error) }] }
  }
}

/**
 * 解析 PDF 发票
 */
async function handleParsePdfInvoice(
  _event: IpcMainInvokeEvent,
  params: ParsePdfInvoiceParams
) {
  try {
    const result = await parsePdfInvoice(params.filePath)
    return result
  } catch (error) {
    console.error('[Reconciliation] Parse PDF invoice error:', error)
    return { success: false, error: String(error) }
  }
}

// ============================================
// 付款人对应关系处理器
// ============================================

/**
 * 获取所有付款人对应关系
 */
async function handleGetPayerMappings() {
  try {
    const mappings = await getAllPayerMappings()
    return { success: true, mappings }
  } catch (error) {
    console.error('[Reconciliation] Get payer mappings error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 添加付款人对应关系
 */
async function handleAddPayerMapping(
  _event: IpcMainInvokeEvent,
  params: AddPayerMappingParams
) {
  try {
    const id = await addPayerMapping({
      personName: params.personName,
      companyName: params.companyName,
      accountSuffix: params.accountSuffix || null,
      remark: params.remark || null,
      source: params.source || 'manual',
    })
    return { success: true, id }
  } catch (error) {
    console.error('[Reconciliation] Add payer mapping error:', error)
    return { success: false, error: String(error) }
  }
}

// ============================================
// 规则匹配处理器
// ============================================

/**
 * 执行规则匹配
 */
async function handleExecuteRuleMatching(
  _event: IpcMainInvokeEvent,
  params: { batchId: string }
) {
  try {
    const result = await executeReconciliation(
      params.batchId,
      {},
      (progress) => {
        sendProgress(RECONCILIATION_CHANNELS.PROGRESS, {
          type: 'reconciliation_process',
          batchId: params.batchId,
          ...progress,
        })
      }
    )
    return result
  } catch (error) {
    console.error('[Reconciliation] Execute rule matching error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 获取匹配统计
 */
async function handleGetMatchingStats(
  _event: IpcMainInvokeEvent,
  params: { batchId: string }
) {
  try {
    const stats = await getMatchingStats(params.batchId)
    return { success: true, stats }
  } catch (error) {
    console.error('[Reconciliation] Get matching stats error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 获取所有匹配结果
 */
async function handleGetMatchResults(
  _event: IpcMainInvokeEvent,
  params: { batchId: string; type?: string }
) {
  try {
    const results = await getMatchResults(params.batchId)
    // 简单的客户端过滤
    if (params.type === 'explainable') {
      return {
        success: true,
        results: results.filter(r => ['tolerance', 'proxy', 'ai'].includes(r.matchType as string))
      }
    }
    if (params.type) {
      return { success: true, results: results.filter(r => r.matchType === params.type) }
    }
    return { success: true, results }
  } catch (error) {
    console.error('[Reconciliation] Get match results error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 确认匹配结果
 */
async function handleConfirmMatch(
  _event: IpcMainInvokeEvent,
  params: { matchId: string; saveMapping?: boolean }
) {
  try {
    await confirmMatch(params.matchId, params.saveMapping)
    return { success: true }
  } catch (error) {
    console.error('[Reconciliation] Confirm match error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 停止对账
 */
async function handleStopReconciliation(
  _event: IpcMainInvokeEvent,
  params: { batchId: string }
) {
  try {
    requestStop(params.batchId)
    return { success: true }
  } catch (error) {
    console.error('[Reconciliation] Stop reconciliation error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 执行 AI 匹配（Phase 3 实现）
 */
async function handleExecuteAIMatching(
  _event: IpcMainInvokeEvent,
  _params: { batchId: string }
) {
  // TODO: Phase 3 实现
  return { success: false, error: 'Not implemented yet' }
}

/**
 * 提取关系（Phase 3 实现）
 */
async function handleExtractRelations(
  _event: IpcMainInvokeEvent,
  _params: { remarks: string[] }
) {
  // TODO: Phase 3 实现
  return { success: false, error: 'Not implemented yet' }
}

/**
 * 检测异常
 */
async function handleDetectExceptions(
  _event: IpcMainInvokeEvent,
  params: { batchId: string }
) {
  try {
    const result = await detectExceptions(params.batchId)
    const exceptions = await getExceptions(params.batchId)
    return { success: true, result, exceptions }
  } catch (error) {
    console.error('[IPC] Detect exceptions error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 获取异常
 */
async function handleGetExceptions(
  _event: IpcMainInvokeEvent,
  params: { batchId: string; status?: string }
) {
  try {
    const exceptions = await getExceptions(params.batchId, params.status)
    return { success: true, exceptions }
  } catch (error) {
    console.error('[Reconciliation] Get exceptions error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 解决异常
 */
async function handleResolveException(
  _event: IpcMainInvokeEvent,
  params: { exceptionId: string; resolution: string; note?: string }
) {
  try {
    await resolveException(
      params.exceptionId,
      params.resolution as 'resolved' | 'ignored',
      params.note
    )
    return { success: true }
  } catch (error) {
    console.error('[IPC] Resolve exception error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 获取报告预览
 */
async function handleGetReportPreview(
  _event: IpcMainInvokeEvent,
  params: { batchId: string }
) {
  try {
    const batch = await getBatch(params.batchId)
    const stats = await getMatchingStats(params.batchId)
    const exceptionsArr = await getExceptions(params.batchId)

    return {
      success: true,
      preview: {
        batch,
        stats,
        exceptionCount: exceptionsArr.length,
        exceptionsByType: {
          NO_INVOICE: exceptionsArr.filter(e => e.type === 'NO_INVOICE').length,
          NO_BANK_TXN: exceptionsArr.filter(e => e.type === 'NO_BANK_TXN').length,
          DUPLICATE_PAYMENT: exceptionsArr.filter(e => e.type === 'DUPLICATE_PAYMENT').length,
          AMOUNT_MISMATCH: exceptionsArr.filter(e => e.type === 'AMOUNT_MISMATCH').length,
        }
      }
    }
  } catch (error) {
    console.error('[IPC] Get report preview error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 生成报告
 */
async function handleGenerateReport(
  _event: IpcMainInvokeEvent,
  params: { batchId: string; types?: string[]; outputDir?: string }
) {
  try {
    const { generateReports } = await import('../../services/reportService')

    const result = await generateReports({
      batchId: params.batchId,
      outputDir: params.outputDir,
    })

    return result
  } catch (error) {
    console.error(' [REPORT_GEN_ERROR] 报告生成发生异常:', error)
    if (error instanceof Error) {
      console.error(' Stack trace:', error.stack)
    }
    return { success: false, files: [], error: error instanceof Error ? error.message : String(error) }
  }
}


/**
 * 获取所有报告
 */
async function handleGetAllReports() {
  try {
    const reports = await getReports()
    return { success: true, reports }
  } catch (error) {
    console.error('[IPC] Get all reports error:', error)
    return { success: false, reports: [], error: String(error) }
  }
}

/**
 * 获取批次相关报告
 */
async function handleGetBatchReports(_event: any, { batchId }: { batchId: string }) {
  try {
    const reports = await getReportsByBatchId(batchId)
    return { success: true, reports }
  } catch (error) {
    console.error('[IPC] Get batch reports error:', error)
    return { success: false, reports: [], error: String(error) }
  }
}


// ============================================
// 映射管理处理器
// ============================================

/**
 * 检测疑似代付记录
 */
async function handleDetectProxyPayments(_event: any, { batchId }: { batchId: string }) {
  try {
    console.log('[IPC] Detecting proxy payments for batch:', batchId)
    const results = await detectProxyPayments(batchId)
    const aggregated = aggregateByPayer(results)
    console.log('[IPC] Found', aggregated.length, 'unique payers with suspected proxy payments')
    return { success: true, proxyPayments: aggregated }
  } catch (error) {
    console.error('[IPC] Detect proxy payments error:', error)
    return { success: false, proxyPayments: [], error: String(error) }
  }
}

/**
 * 获取所有映射关系
 */
async function handleGetAllMappings() {
  try {
    const mappings = await getAllMappings()
    return { success: true, mappings }
  } catch (error) {
    console.error('[IPC] Get all mappings error:', error)
    return { success: false, mappings: [], error: String(error) }
  }
}

/**
 * 批量添加映射关系
 */
async function handleBatchAddMappings(_event: any, { mappings }: { mappings: NewMappingInput[] }) {
  try {
    console.log('[IPC] Batch adding', mappings.length, 'mappings')
    const result = await batchAddMappings(mappings)
    return { success: true, addedCount: result.success, failedCount: result.failed, errors: result.errors }
  } catch (error) {
    console.error('[IPC] Batch add mappings error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 更新映射关系
 */
async function handleUpdateMapping(_event: any, { id, data }: { id: string; data: Partial<NewMappingInput> }) {
  try {
    await updateMapping(id, data)
    return { success: true }
  } catch (error) {
    console.error('[IPC] Update mapping error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 删除映射关系
 */
async function handleDeleteMapping(_event: any, { id }: { id: string }) {
  try {
    await deleteMapping(id)
    return { success: true }
  } catch (error) {
    console.error('[IPC] Delete mapping error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 导出映射关系为 Excel
 */
async function handleExportMappings() {
  try {
    const mappings = await getAllMappings()

    // 转换为 Excel 格式
    const data = mappings.map(m => ({
      '付款人': m.personName,
      '对应公司': m.companyName,
      '账户后四位': m.accountSuffix || '',
      '备注': m.remark || '',
      '来源': m.source || 'manual',
      '添加时间': m.createdAt ? new Date(m.createdAt).toLocaleString() : ''
    }))

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '映射关系')

    // 选择保存路径
    const result = await dialog.showSaveDialog({
      title: '导出映射关系',
      defaultPath: path.join(app.getPath('documents'), `付款人映射_${new Date().toISOString().slice(0, 10)}.xlsx`),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true }
    }

    XLSX.writeFile(wb, result.filePath)
    return { success: true, filePath: result.filePath }
  } catch (error) {
    console.error('[IPC] Export mappings error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 获取销售方建议列表
 */
async function handleGetSellerSuggestions(_event: any, { batchId }: { batchId?: string }) {
  try {
    const suggestions = await getSellerSuggestions(batchId)
    return { success: true, suggestions }
  } catch (error) {
    console.error('[IPC] Get seller suggestions error:', error)
    return { success: false, suggestions: [], error: String(error) }
  }
}

// ============================================
// 注册所有处理器
// ============================================

export function registerReconciliationHandlers(): void {
  console.log('[IPC] Registering reconciliation handlers...')

  // 批次管理
  ipcMain.handle(RECONCILIATION_CHANNELS.CREATE_BATCH, handleCreateBatch)
  ipcMain.handle(RECONCILIATION_CHANNELS.GET_BATCH, handleGetBatch)
  ipcMain.handle(RECONCILIATION_CHANNELS.GET_ALL_BATCHES, handleGetAllBatches)
  ipcMain.handle(RECONCILIATION_CHANNELS.DELETE_BATCH, handleDeleteBatch)

  // 数据导入
  ipcMain.handle(RECONCILIATION_CHANNELS.IMPORT_BANK_TRANSACTIONS, handleImportBankTransactions)
  ipcMain.handle(RECONCILIATION_CHANNELS.IMPORT_INVOICES, handleImportInvoices)
  ipcMain.handle(RECONCILIATION_CHANNELS.IMPORT_PAYER_MAPPINGS, handleImportPayerMappings)
  ipcMain.handle(RECONCILIATION_CHANNELS.PARSE_PDF_INVOICE, handleParsePdfInvoice)

  // 付款人对应关系
  ipcMain.handle(RECONCILIATION_CHANNELS.GET_PAYER_MAPPINGS, handleGetPayerMappings)
  ipcMain.handle(RECONCILIATION_CHANNELS.ADD_PAYER_MAPPING, handleAddPayerMapping)

  // 规则匹配
  ipcMain.handle(RECONCILIATION_CHANNELS.EXECUTE_RULE_MATCHING, handleExecuteRuleMatching)
  ipcMain.handle(RECONCILIATION_CHANNELS.STOP_RECONCILIATION, handleStopReconciliation)
  ipcMain.handle(RECONCILIATION_CHANNELS.GET_MATCHING_STATS, handleGetMatchingStats)
  ipcMain.handle(RECONCILIATION_CHANNELS.GET_MATCH_RESULTS, handleGetMatchResults)
  ipcMain.handle(RECONCILIATION_CHANNELS.CONFIRM_MATCH, handleConfirmMatch)

  // AI 匹配（占位）
  ipcMain.handle(RECONCILIATION_CHANNELS.EXECUTE_AI_MATCHING, handleExecuteAIMatching)
  ipcMain.handle(RECONCILIATION_CHANNELS.EXTRACT_RELATIONS, handleExtractRelations)

  // 异常检测（占位）
  ipcMain.handle(RECONCILIATION_CHANNELS.DETECT_EXCEPTIONS, handleDetectExceptions)
  ipcMain.handle(RECONCILIATION_CHANNELS.GET_EXCEPTIONS, handleGetExceptions)
  ipcMain.handle(RECONCILIATION_CHANNELS.RESOLVE_EXCEPTION, handleResolveException)

  // 报告（占位）
  ipcMain.handle(RECONCILIATION_CHANNELS.GET_REPORT_PREVIEW, handleGetReportPreview)
  ipcMain.handle(RECONCILIATION_CHANNELS.GENERATE_REPORT, handleGenerateReport)
  ipcMain.handle(RECONCILIATION_CHANNELS.GET_ALL_REPORTS, handleGetAllReports)
  ipcMain.handle(RECONCILIATION_CHANNELS.ARCHIVE_BATCH, handleArchiveBatch)
  ipcMain.handle(RECONCILIATION_CHANNELS.GET_BATCH_REPORTS, handleGetBatchReports)

  // 映射管理
  ipcMain.handle(RECONCILIATION_CHANNELS.DETECT_PROXY_PAYMENTS, handleDetectProxyPayments)
  ipcMain.handle(RECONCILIATION_CHANNELS.GET_ALL_MAPPINGS, handleGetAllMappings)
  ipcMain.handle(RECONCILIATION_CHANNELS.BATCH_ADD_MAPPINGS, handleBatchAddMappings)
  ipcMain.handle(RECONCILIATION_CHANNELS.UPDATE_MAPPING, handleUpdateMapping)
  ipcMain.handle(RECONCILIATION_CHANNELS.DELETE_MAPPING, handleDeleteMapping)
  ipcMain.handle(RECONCILIATION_CHANNELS.EXPORT_MAPPINGS, handleExportMappings)
  ipcMain.handle(RECONCILIATION_CHANNELS.GET_SELLER_SUGGESTIONS, handleGetSellerSuggestions)

  // 去重
  ipcMain.handle(RECONCILIATION_CHANNELS.DEDUPLICATE_MAPPINGS, handleDeduplicateMappings)

  // 发票 PDF 解析
  ipcMain.handle(RECONCILIATION_CHANNELS.SCAN_PDF_FOLDER, handleScanPdfFolder)
  ipcMain.handle(RECONCILIATION_CHANNELS.PARSE_PDF_INVOICES, handleParsePdfInvoices)
  ipcMain.handle(RECONCILIATION_CHANNELS.EXPORT_INVOICES_EXCEL, handleExportInvoicesExcel)
  ipcMain.handle(RECONCILIATION_CHANNELS.IMPORT_PDF_INVOICES, handleImportPdfInvoices)

  console.log('[IPC] Reconciliation handlers registered')
}

/**
 * 归档批次
 */
async function handleArchiveBatch(_event: IpcMainInvokeEvent, { batchId }: { batchId: string }) {
  try {
    const result = await archiveBatch(batchId)
    return result
  } catch (error) {
    console.error('[IPC] Archive batch error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 执行付款人映射去重
 */
async function handleDeduplicateMappings() {
  try {
    const { deduplicateMappings } = await import('../../services/mappingService')
    const count = await deduplicateMappings()
    return { success: true, count }
  } catch (error) {
    console.error('[IPC] Deduplicate mappings error:', error)
    return { success: false, error: String(error) }
  }
}

// ============================================
// 发票 PDF 解析处理器
// ============================================

/**
 * 扫描文件夹中的 PDF 发票文件
 */
async function handleScanPdfFolder(
  _event: IpcMainInvokeEvent,
  params: { folderPath: string }
) {
  try {
    const { scanPdfFiles } = await import('../../services/invoiceParseService')
    return scanPdfFiles(params.folderPath)
  } catch (error) {
    console.error('[IPC] Scan PDF folder error:', error)
    return { success: false, files: [], error: String(error) }
  }
}

/**
 * 批量解析 PDF 发票
 */
async function handleParsePdfInvoices(
  _event: IpcMainInvokeEvent,
  params: { folderPath: string }
) {
  try {
    const { batchParsePdfInvoices } = await import('../../services/invoiceParseService')
    const result = await batchParsePdfInvoices(
      params.folderPath,
      (current, total, fileName) => {
        sendProgress(RECONCILIATION_CHANNELS.PROGRESS, {
          type: 'parse_pdf_invoices',
          current,
          total,
          fileName,
        })
      }
    )
    return result
  } catch (error) {
    console.error('[IPC] Parse PDF invoices error:', error)
    return { success: false, invoices: [], errors: [{ filePath: '', error: String(error) }], totalFiles: 0, successCount: 0, failCount: 0 }
  }
}

/**
 * 导出发票解析结果为 Excel
 */
async function handleExportInvoicesExcel(
  _event: IpcMainInvokeEvent,
  params: { folderPath: string; outputPath?: string }
) {
  try {
    const { batchParsePdfInvoices, exportInvoicesToExcel } = await import('../../services/invoiceParseService')

    // 先解析
    const parseResult = await batchParsePdfInvoices(
      params.folderPath,
      (current, total, fileName) => {
        sendProgress(RECONCILIATION_CHANNELS.PROGRESS, {
          type: 'parse_pdf_invoices',
          current,
          total,
          fileName,
        })
      }
    )

    if (!parseResult.success || parseResult.invoices.length === 0) {
      // Include error details from parseResult for better debugging
      const errorDetails = parseResult.errors && parseResult.errors.length > 0
        ? ': ' + parseResult.errors.map(e => e.error).join('; ')
        : ''
      return { success: false, error: '没有成功解析任何发票' + errorDetails, parseResult }
    }

    // 确定输出路径
    let outputPath = params.outputPath
    if (!outputPath) {
      // 自动保存到发票文件夹同级，不弹框提示
      const now = new Date()
      // 格式：YYYY-MM-DD_HH-mm-ss
      const dateStr = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + '_' +
        String(now.getHours()).padStart(2, '0') + '-' +
        String(now.getMinutes()).padStart(2, '0') + '-' +
        String(now.getSeconds()).padStart(2, '0')
      outputPath = path.join(params.folderPath, `发票清单_${dateStr}.xlsx`)
    }

    // 导出 Excel
    const exportResult = await exportInvoicesToExcel(parseResult.invoices, outputPath)

    console.log('exportResult', exportResult)
    return {
      ...exportResult,
      invoices: parseResult.invoices,  // 返回解析后的发票数据供前端直接入库
      parseResult: {
        totalFiles: parseResult.totalFiles,
        successCount: parseResult.successCount,
        duplicateCount: parseResult.duplicateCount,
        duplicates: parseResult.duplicates,
        failCount: parseResult.failCount,
        errors: parseResult.errors,
      }
    }
  } catch (error) {
    console.error('[IPC] Export invoices Excel error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 导入 PDF 解析后的发票数据（含跨批次去重）
 */
async function handleImportPdfInvoices(
  _event: IpcMainInvokeEvent,
  params: { batchId: string; invoices: any[] }
) {
  try {
    const result = await importPdfInvoices(
      params.batchId,
      params.invoices,
      (progress) => {
        sendProgress(RECONCILIATION_CHANNELS.PROGRESS, progress)
      }
    )
    return result
  } catch (error) {
    console.error('[IPC] Import PDF invoices error:', error)
    return { success: false, imported: 0, skippedDuplicates: [], errors: [{ row: 0, message: String(error) }] }
  }
}
