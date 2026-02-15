/**
 * Preload 脚本
 * 通过 contextBridge 安全地暴露 API 给渲染进程
 */
import { contextBridge, ipcRenderer } from 'electron';
import {
  AI_CHANNELS,
  APP_CHANNELS,
  CONFIG_CHANNELS,
  DB_CHANNELS,
  FILE_CHANNELS,
  RECONCILIATION_CHANNELS
} from './ipc/channels';

// 调试日志
console.log('[Preload] Script starting...')
console.log('[Preload] RECONCILIATION_CHANNELS:', RECONCILIATION_CHANNELS)

// --------- 类型定义 ---------

interface QueryFilter {
  where?: Record<string, any>
  orderBy?: { field: string; direction: 'asc' | 'desc' }
  pagination?: { page: number; pageSize: number }
}

interface QueryResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

// --------- 暴露给渲染进程的 API ---------

contextBridge.exposeInMainWorld('electron', {
  /**
   * 数据库操作 API
   */
  db: {
    query: <T>(table: string, filter?: QueryFilter): Promise<QueryResult<T>> =>
      ipcRenderer.invoke(DB_CHANNELS.QUERY, { table, filter }),

    insert: (table: string, data: Record<string, any>): Promise<{ id: string }> =>
      ipcRenderer.invoke(DB_CHANNELS.INSERT, { table, data }),

    update: (table: string, id: string, data: Record<string, any>): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(DB_CHANNELS.UPDATE, { table, id, data }),

    delete: (table: string, id: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(DB_CHANNELS.DELETE, { table, id }),

    batchInsert: (table: string, items: Record<string, any>[]): Promise<{ ids: string[] }> =>
      ipcRenderer.invoke(DB_CHANNELS.BATCH_INSERT, { table, items }),
  },

  /**
   * 配置操作 API
   */
  config: {
    get: <T>(key: string): Promise<{ success: boolean; value?: T; error?: string }> =>
      ipcRenderer.invoke(CONFIG_CHANNELS.GET, { key }),

    set: (key: string, value: any): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(CONFIG_CHANNELS.SET, { key, value }),

    getAll: (): Promise<{ success: boolean; config?: any; error?: string }> =>
      ipcRenderer.invoke(CONFIG_CHANNELS.GET_ALL),

    reset: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(CONFIG_CHANNELS.RESET),
  },

  /**
   * 文件操作 API
   */
  file: {
    import: (type?: 'excel' | 'csv' | 'json'): Promise<{
      success: boolean
      canceled?: boolean
      filePath?: string
      originalPath?: string
      fileName?: string
      content?: string
      error?: string
    }> => ipcRenderer.invoke(FILE_CHANNELS.IMPORT, { type }),

    export: (content: string, filename: string, type?: string): Promise<{
      success: boolean
      filePath?: string
      error?: string
    }> => ipcRenderer.invoke(FILE_CHANNELS.EXPORT, { content, filename, type }),

    listImports: (): Promise<{
      success: boolean
      files: Array<{
        name: string
        path: string
        size: number
        createdAt: Date
        modifiedAt: Date
      }>
      error?: string
    }> => ipcRenderer.invoke(FILE_CHANNELS.LIST_IMPORTS),

    listExports: (): Promise<{
      success: boolean
      files: Array<{
        name: string
        path: string
        size: number
        createdAt: Date
        modifiedAt: Date
      }>
      error?: string
    }> => ipcRenderer.invoke(FILE_CHANNELS.LIST_EXPORTS),

    delete: (filePath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(FILE_CHANNELS.DELETE, { filePath }),

    openDialog: (options?: {
      title?: string
      filters?: Array<{ name: string; extensions: string[] }>
      multiple?: boolean
    }): Promise<{
      success: boolean
      canceled: boolean
      filePaths: string[]
      error?: string
    }> => ipcRenderer.invoke(FILE_CHANNELS.OPEN_DIALOG, options || {}),

    saveDialog: (options?: {
      title?: string
      defaultPath?: string
      filters?: Array<{ name: string; extensions: string[] }>
    }): Promise<{
      success: boolean
      canceled: boolean
      filePath?: string
      error?: string
    }> => ipcRenderer.invoke(FILE_CHANNELS.SAVE_DIALOG, options || {}),

    /**
     * 选择文件夹
     */
    selectFolder: (title?: string): Promise<{
      success: boolean
      canceled: boolean
      folderPath?: string
      error?: string
    }> => ipcRenderer.invoke(FILE_CHANNELS.SELECT_FOLDER, { title }),

    /**
     * 扫描文件夹中的 Excel 文件
     */
    scanFolder: (folderPath: string): Promise<{
      success: boolean
      files: {
        name: string
        path: string
        size: number
        modifiedAt: Date
      }[]
      hasMore: boolean
      error?: string
    }> => ipcRenderer.invoke(FILE_CHANNELS.SCAN_FOLDER, { folderPath }),

    /**
     * 初始化工作目录结构
     */
    initWorkspace: (rootPath: string): Promise<{
      success: boolean
      created: string[]
      error?: string
    }> => ipcRenderer.invoke(FILE_CHANNELS.INIT_WORKSPACE, { rootPath }),

    /**
     * 验证工作目录
     */
    validateWorkspace: (workspaceFolder: string): Promise<{
      valid: boolean
      rebuilt: boolean
      error?: string
    }> => ipcRenderer.invoke(FILE_CHANNELS.VALIDATE_WORKSPACE, { workspaceFolder }),
  },

  /**
   * AI 操作 API
   */
  ai: {
    setKey: (provider: string, apiKey: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(AI_CHANNELS.SET_KEY, { provider, apiKey }),

    checkKey: (provider: string): Promise<{ valid: boolean; error?: string }> =>
      ipcRenderer.invoke(AI_CHANNELS.CHECK_KEY, { provider }),

    removeKey: (provider: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(AI_CHANNELS.REMOVE_KEY, { provider }),

    getConfig: (): Promise<{
      success: boolean
      config?: {
        provider: string
        model: string
        temperature: number
        maxTokens: number
        hasApiKey: boolean
      }
      error?: string
    }> => ipcRenderer.invoke(AI_CHANNELS.GET_CONFIG),

    setConfig: (config: {
      provider?: string
      model?: string
      temperature?: number
      maxTokens?: number
    }): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(AI_CHANNELS.SET_CONFIG, config),

    analyze: (data: any, prompt: string): Promise<{
      success: boolean
      result?: string
      tokens?: number
      error?: string
    }> => ipcRenderer.invoke(AI_CHANNELS.ANALYZE, { data, prompt }),
  },

  /**
   * 应用通用 API
   */
  app: {
    getVersion: (): Promise<string> =>
      ipcRenderer.invoke(APP_CHANNELS.GET_VERSION),

    getPlatform: (): Promise<string> =>
      ipcRenderer.invoke(APP_CHANNELS.GET_PLATFORM),

    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke(APP_CHANNELS.OPEN_EXTERNAL, { url }),

    showInFolder: (filePath: string): Promise<void> =>
      ipcRenderer.invoke(APP_CHANNELS.SHOW_IN_FOLDER, { filePath }),

    openPath: (path: string): Promise<string> =>
      ipcRenderer.invoke(APP_CHANNELS.OPEN_PATH, { path }),
  },

  /**
   * 核销操作 API
   */
  reconciliation: {
    // 批次管理
    createBatch: (name: string): Promise<{ success: boolean; batchId?: string; error?: string }> =>
      ipcRenderer.invoke(RECONCILIATION_CHANNELS.CREATE_BATCH, { name }),

    getBatch: (batchId: string): Promise<{ success: boolean; batch?: any; error?: string }> =>
      ipcRenderer.invoke(RECONCILIATION_CHANNELS.GET_BATCH, { batchId }),

    getAllBatches: (): Promise<{ success: boolean; batches?: any[]; error?: string }> =>
      ipcRenderer.invoke(RECONCILIATION_CHANNELS.GET_ALL_BATCHES),

    deleteBatch: (batchId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(RECONCILIATION_CHANNELS.DELETE_BATCH, { batchId }),

    // 数据导入
    importBankTransactions: (batchId: string, filePath: string): Promise<{
      success: boolean
      count: number
      errors: Array<{ row: number; message: string }>
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.IMPORT_BANK_TRANSACTIONS, { batchId, filePath }),

    importInvoices: (batchId: string, filePath: string): Promise<{
      success: boolean
      count: number
      errors: Array<{ row: number; message: string }>
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.IMPORT_INVOICES, { batchId, filePath }),

    importPayerMappings: (filePath: string): Promise<{
      success: boolean
      count: number
      errors: Array<{ row: number; message: string }>
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.IMPORT_PAYER_MAPPINGS, { filePath }),

    parsePdfInvoice: (filePath: string): Promise<{
      success: boolean
      pdfText?: string
      error?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.PARSE_PDF_INVOICE, { filePath }),

    // 付款人对应关系
    getPayerMappings: (): Promise<{ success: boolean; mappings?: any[]; error?: string }> =>
      ipcRenderer.invoke(RECONCILIATION_CHANNELS.GET_PAYER_MAPPINGS),

    addPayerMapping: (mapping: {
      personName: string
      companyName: string
      accountSuffix?: string
      remark?: string
    }): Promise<{ success: boolean; id?: string; error?: string }> =>
      ipcRenderer.invoke(RECONCILIATION_CHANNELS.ADD_PAYER_MAPPING, mapping),

    // 规则匹配
    executeRuleMatching: (batchId: string): Promise<{
      success: boolean
      perfectCount?: number
      toleranceCount?: number
      proxyCount?: number
      remainingBankCount?: number
      remainingInvoiceCount?: number
      error?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.EXECUTE_RULE_MATCHING, { batchId }),

    stopReconciliation: (batchId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(RECONCILIATION_CHANNELS.STOP_RECONCILIATION, { batchId }),

    getMatchResults: (batchId: string, type?: string): Promise<{
      success: boolean
      results?: any[]
      error?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.GET_MATCH_RESULTS, { batchId, type }),

    // AI 匹配
    executeAIMatching: (batchId: string): Promise<{
      success: boolean
      processedCount?: number
      matchedCount?: number
      error?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.EXECUTE_AI_MATCHING, { batchId }),

    extractRelations: (remarks: string[]): Promise<{
      success: boolean
      relations?: Array<{ person: string; company: string; relation: string }>
      error?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.EXTRACT_RELATIONS, { remarks }),

    // 异常检测
    getExceptions: (batchId: string, status?: string): Promise<{
      success: boolean
      exceptions?: any[]
      error?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.GET_EXCEPTIONS, { batchId, status }),

    detectExceptions: (batchId: string): Promise<{
      success: boolean
      total?: number
      exceptions?: any[]
      error?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.DETECT_EXCEPTIONS, { batchId }),

    resolveException: (exceptionId: string, resolution: string, note?: string): Promise<{
      success: boolean
      error?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.RESOLVE_EXCEPTION, { exceptionId, resolution, note }),

    // 报告
    getReportPreview: (batchId: string): Promise<{
      success: boolean
      preview?: any
      error?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.GET_REPORT_PREVIEW, { batchId }),

    generateReport: (batchId: string, types: string[]): Promise<{
      success: boolean
      files?: string[]
      error?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.GENERATE_REPORT, { batchId, types }),

    getAllReports: (): Promise<{
      success: boolean
      reports?: any[]
      error?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.GET_ALL_REPORTS),

    archiveBatch: (batchId: string): Promise<{
      success: boolean
      archivePath?: string
      movedFilesCount?: number
      error?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.ARCHIVE_BATCH, { batchId }),

    getBatchReports: (batchId: string): Promise<{
      success: boolean
      reports?: any[]
      error?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.GET_BATCH_REPORTS, { batchId }),

    // 映射管理
    detectProxyPayments: (batchId: string): Promise<{
      success: boolean
      proxyPayments?: any[]
      error?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.DETECT_PROXY_PAYMENTS, { batchId }),

    getAllMappings: (): Promise<{
      success: boolean
      mappings?: any[]
      error?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.GET_ALL_MAPPINGS),

    batchAddMappings: (mappings: Array<{
      personName: string
      companyName: string
      accountSuffix?: string
      remark?: string
      source?: string
    }>): Promise<{
      success: boolean
      addedCount?: number
      failedCount?: number
      errors?: any[]
      error?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.BATCH_ADD_MAPPINGS, { mappings }),

    updateMapping: (id: string, data: {
      personName?: string
      companyName?: string
      accountSuffix?: string
      remark?: string
    }): Promise<{
      success: boolean
      error?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.UPDATE_MAPPING, { id, data }),

    deleteMapping: (id: string): Promise<{
      success: boolean
      error?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.DELETE_MAPPING, { id }),

    exportMappings: (): Promise<{
      success: boolean
      filePath?: string
      canceled?: boolean
      error?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.EXPORT_MAPPINGS),

    getSellerSuggestions: (batchId?: string): Promise<{
      success: boolean
      suggestions?: string[]
      error?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.GET_SELLER_SUGGESTIONS, { batchId }),

    deduplicateMappings: (): Promise<{
      success: boolean
      count?: number
      error?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.DEDUPLICATE_MAPPINGS),

    // 发票 PDF 解析
    scanPdfFolder: (folderPath: string): Promise<{
      success: boolean
      files: Array<{ name: string; path: string; size: number; modifiedAt: Date }>
      error?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.SCAN_PDF_FOLDER, { folderPath }),

    parsePdfInvoices: (folderPath: string): Promise<{
      success: boolean
      invoices: any[]
      errors: Array<{ filePath: string; error: string }>
      totalFiles: number
      successCount: number
      failCount: number
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.PARSE_PDF_INVOICES, { folderPath }),

    exportInvoicesExcel: (folderPath: string, outputPath?: string): Promise<{
      success: boolean
      filePath?: string
      invoices?: any[]
      parseResult?: {
        totalFiles: number
        successCount: number
        duplicateCount: number
        duplicates: Array<{ fileName: string; invoiceNumber: string | null; reason: string }>
        failCount: number
        errors: Array<{ filePath: string; error: string }>
      }
      error?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.EXPORT_INVOICES_EXCEL, { folderPath, outputPath }),

    importPdfInvoices: (batchId: string, invoices: any[]): Promise<{
      success: boolean
      imported: number
      skippedDuplicates: Array<{ invoiceNumber: string | null; fileName: string; reason: string }>
      errors: Array<{ row: number; message: string }>
      batchId?: string
    }> => ipcRenderer.invoke(RECONCILIATION_CHANNELS.IMPORT_PDF_INVOICES, { batchId, invoices }),

    // 进度事件监听
    onProgress: (callback: (data: any) => void) => {
      ipcRenderer.on(RECONCILIATION_CHANNELS.PROGRESS, (_event, data) => callback(data))
      return () => ipcRenderer.removeAllListeners(RECONCILIATION_CHANNELS.PROGRESS)
    },
  },
})

// 保留原有的 ipcRenderer 暴露（向后兼容）
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})
