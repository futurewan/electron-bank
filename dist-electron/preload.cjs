"use strict";
const electron = require("electron");
const DB_CHANNELS = {
  QUERY: "db:query",
  INSERT: "db:insert",
  UPDATE: "db:update",
  DELETE: "db:delete",
  BATCH_INSERT: "db:batch-insert"
};
const CONFIG_CHANNELS = {
  GET: "config:get",
  SET: "config:set",
  GET_ALL: "config:get-all",
  RESET: "config:reset"
};
const FILE_CHANNELS = {
  IMPORT: "file:import",
  EXPORT: "file:export",
  LIST_IMPORTS: "file:list-imports",
  LIST_EXPORTS: "file:list-exports",
  DELETE: "file:delete",
  OPEN_DIALOG: "file:open-dialog",
  SAVE_DIALOG: "file:save-dialog",
  SELECT_FOLDER: "file:select-folder",
  SCAN_FOLDER: "file:scan-folder",
  INIT_WORKSPACE: "file:init-workspace",
  VALIDATE_WORKSPACE: "file:validate-workspace"
};
const AI_CHANNELS = {
  SET_KEY: "ai:set-key",
  CHECK_KEY: "ai:check-key",
  REMOVE_KEY: "ai:remove-key",
  GET_CONFIG: "ai:get-config",
  SET_CONFIG: "ai:set-config",
  ANALYZE: "ai:analyze"
};
const APP_CHANNELS = {
  GET_VERSION: "app:get-version",
  GET_PLATFORM: "app:get-platform",
  OPEN_EXTERNAL: "app:open-external",
  SHOW_IN_FOLDER: "app:show-in-folder",
  OPEN_PATH: "app:open-path"
};
const RECONCILIATION_CHANNELS = {
  // 批次管理
  CREATE_BATCH: "reconciliation:create-batch",
  GET_BATCH: "reconciliation:get-batch",
  GET_ALL_BATCHES: "reconciliation:get-all-batches",
  DELETE_BATCH: "reconciliation:delete-batch",
  // 数据导入
  IMPORT_BANK_TRANSACTIONS: "reconciliation:import-bank-transactions",
  IMPORT_INVOICES: "reconciliation:import-invoices",
  IMPORT_PAYER_MAPPINGS: "reconciliation:import-payer-mappings",
  PARSE_PDF_INVOICE: "reconciliation:parse-pdf-invoice",
  // 付款人对应关系
  GET_PAYER_MAPPINGS: "reconciliation:get-payer-mappings",
  ADD_PAYER_MAPPING: "reconciliation:add-payer-mapping",
  // 规则匹配
  EXECUTE_RULE_MATCHING: "reconciliation:execute-rule-matching",
  GET_MATCHING_STATS: "reconciliation:get-matching-stats",
  GET_MATCH_RESULTS: "reconciliation:get-match-results",
  // AI 匹配
  EXECUTE_AI_MATCHING: "reconciliation:execute-ai-matching",
  STOP_RECONCILIATION: "reconciliation:stop",
  EXTRACT_RELATIONS: "reconciliation:extract-relations",
  // 异常检测
  DETECT_EXCEPTIONS: "reconciliation:detect-exceptions",
  GET_EXCEPTIONS: "reconciliation:get-exceptions",
  RESOLVE_EXCEPTION: "reconciliation:resolve-exception",
  // 报告
  GET_REPORT_PREVIEW: "reconciliation:get-report-preview",
  GENERATE_REPORT: "reconciliation:generate-report",
  GET_ALL_REPORTS: "reconciliation:get-all-reports",
  ARCHIVE_BATCH: "reconciliation:archive",
  GET_BATCH_REPORTS: "reconciliation:get-batch-reports",
  // 映射管理
  DETECT_PROXY_PAYMENTS: "reconciliation:detect-proxy-payments",
  GET_ALL_MAPPINGS: "reconciliation:get-all-mappings",
  BATCH_ADD_MAPPINGS: "reconciliation:batch-add-mappings",
  UPDATE_MAPPING: "reconciliation:update-mapping",
  DELETE_MAPPING: "reconciliation:delete-mapping",
  EXPORT_MAPPINGS: "reconciliation:export-mappings",
  DEDUPLICATE_MAPPINGS: "reconciliation:deduplicate-mappings",
  GET_SELLER_SUGGESTIONS: "reconciliation:get-seller-suggestions",
  // 发票 PDF 解析
  SCAN_PDF_FOLDER: "reconciliation:scan-pdf-folder",
  PARSE_PDF_INVOICES: "reconciliation:parse-pdf-invoices",
  EXPORT_INVOICES_EXCEL: "reconciliation:export-invoices-excel",
  IMPORT_PDF_INVOICES: "reconciliation:import-pdf-invoices",
  // 进度事件
  PROGRESS: "reconciliation:progress"
};
console.log("[Preload] Script starting...");
console.log("[Preload] RECONCILIATION_CHANNELS:", RECONCILIATION_CHANNELS);
electron.contextBridge.exposeInMainWorld("electron", {
  /**
   * 数据库操作 API
   */
  db: {
    query: (table, filter) => electron.ipcRenderer.invoke(DB_CHANNELS.QUERY, { table, filter }),
    insert: (table, data) => electron.ipcRenderer.invoke(DB_CHANNELS.INSERT, { table, data }),
    update: (table, id, data) => electron.ipcRenderer.invoke(DB_CHANNELS.UPDATE, { table, id, data }),
    delete: (table, id) => electron.ipcRenderer.invoke(DB_CHANNELS.DELETE, { table, id }),
    batchInsert: (table, items) => electron.ipcRenderer.invoke(DB_CHANNELS.BATCH_INSERT, { table, items })
  },
  /**
   * 配置操作 API
   */
  config: {
    get: (key) => electron.ipcRenderer.invoke(CONFIG_CHANNELS.GET, { key }),
    set: (key, value) => electron.ipcRenderer.invoke(CONFIG_CHANNELS.SET, { key, value }),
    getAll: () => electron.ipcRenderer.invoke(CONFIG_CHANNELS.GET_ALL),
    reset: () => electron.ipcRenderer.invoke(CONFIG_CHANNELS.RESET)
  },
  /**
   * 文件操作 API
   */
  file: {
    import: (type) => electron.ipcRenderer.invoke(FILE_CHANNELS.IMPORT, { type }),
    export: (content, filename, type) => electron.ipcRenderer.invoke(FILE_CHANNELS.EXPORT, { content, filename, type }),
    listImports: () => electron.ipcRenderer.invoke(FILE_CHANNELS.LIST_IMPORTS),
    listExports: () => electron.ipcRenderer.invoke(FILE_CHANNELS.LIST_EXPORTS),
    delete: (filePath) => electron.ipcRenderer.invoke(FILE_CHANNELS.DELETE, { filePath }),
    openDialog: (options) => electron.ipcRenderer.invoke(FILE_CHANNELS.OPEN_DIALOG, options || {}),
    saveDialog: (options) => electron.ipcRenderer.invoke(FILE_CHANNELS.SAVE_DIALOG, options || {}),
    /**
     * 选择文件夹
     */
    selectFolder: (title) => electron.ipcRenderer.invoke(FILE_CHANNELS.SELECT_FOLDER, { title }),
    /**
     * 扫描文件夹中的 Excel 文件
     */
    scanFolder: (folderPath) => electron.ipcRenderer.invoke(FILE_CHANNELS.SCAN_FOLDER, { folderPath }),
    /**
     * 初始化工作目录结构
     */
    initWorkspace: (rootPath) => electron.ipcRenderer.invoke(FILE_CHANNELS.INIT_WORKSPACE, { rootPath }),
    /**
     * 验证工作目录
     */
    validateWorkspace: (workspaceFolder) => electron.ipcRenderer.invoke(FILE_CHANNELS.VALIDATE_WORKSPACE, { workspaceFolder })
  },
  /**
   * AI 操作 API
   */
  ai: {
    setKey: (provider, apiKey) => electron.ipcRenderer.invoke(AI_CHANNELS.SET_KEY, { provider, apiKey }),
    checkKey: (provider) => electron.ipcRenderer.invoke(AI_CHANNELS.CHECK_KEY, { provider }),
    removeKey: (provider) => electron.ipcRenderer.invoke(AI_CHANNELS.REMOVE_KEY, { provider }),
    getConfig: () => electron.ipcRenderer.invoke(AI_CHANNELS.GET_CONFIG),
    setConfig: (config) => electron.ipcRenderer.invoke(AI_CHANNELS.SET_CONFIG, config),
    analyze: (data, prompt) => electron.ipcRenderer.invoke(AI_CHANNELS.ANALYZE, { data, prompt })
  },
  /**
   * 应用通用 API
   */
  app: {
    getVersion: () => electron.ipcRenderer.invoke(APP_CHANNELS.GET_VERSION),
    getPlatform: () => electron.ipcRenderer.invoke(APP_CHANNELS.GET_PLATFORM),
    openExternal: (url) => electron.ipcRenderer.invoke(APP_CHANNELS.OPEN_EXTERNAL, { url }),
    showInFolder: (filePath) => electron.ipcRenderer.invoke(APP_CHANNELS.SHOW_IN_FOLDER, { filePath }),
    openPath: (path) => electron.ipcRenderer.invoke(APP_CHANNELS.OPEN_PATH, { path })
  },
  /**
   * 核销操作 API
   */
  reconciliation: {
    // 批次管理
    createBatch: (name) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.CREATE_BATCH, { name }),
    getBatch: (batchId) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.GET_BATCH, { batchId }),
    getAllBatches: () => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.GET_ALL_BATCHES),
    deleteBatch: (batchId) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.DELETE_BATCH, { batchId }),
    // 数据导入
    importBankTransactions: (batchId, filePath) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.IMPORT_BANK_TRANSACTIONS, { batchId, filePath }),
    importInvoices: (batchId, filePath) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.IMPORT_INVOICES, { batchId, filePath }),
    importPayerMappings: (filePath) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.IMPORT_PAYER_MAPPINGS, { filePath }),
    parsePdfInvoice: (filePath) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.PARSE_PDF_INVOICE, { filePath }),
    // 付款人对应关系
    getPayerMappings: () => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.GET_PAYER_MAPPINGS),
    addPayerMapping: (mapping) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.ADD_PAYER_MAPPING, mapping),
    // 规则匹配
    executeRuleMatching: (batchId) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.EXECUTE_RULE_MATCHING, { batchId }),
    stopReconciliation: (batchId) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.STOP_RECONCILIATION, { batchId }),
    getMatchResults: (batchId, type) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.GET_MATCH_RESULTS, { batchId, type }),
    // AI 匹配
    executeAIMatching: (batchId) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.EXECUTE_AI_MATCHING, { batchId }),
    extractRelations: (remarks) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.EXTRACT_RELATIONS, { remarks }),
    // 异常检测
    getExceptions: (batchId, status) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.GET_EXCEPTIONS, { batchId, status }),
    detectExceptions: (batchId) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.DETECT_EXCEPTIONS, { batchId }),
    resolveException: (exceptionId, resolution, note) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.RESOLVE_EXCEPTION, { exceptionId, resolution, note }),
    // 报告
    getReportPreview: (batchId) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.GET_REPORT_PREVIEW, { batchId }),
    generateReport: (batchId, types) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.GENERATE_REPORT, { batchId, types }),
    getAllReports: () => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.GET_ALL_REPORTS),
    archiveBatch: (batchId) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.ARCHIVE_BATCH, { batchId }),
    getBatchReports: (batchId) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.GET_BATCH_REPORTS, { batchId }),
    // 映射管理
    detectProxyPayments: (batchId) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.DETECT_PROXY_PAYMENTS, { batchId }),
    getAllMappings: () => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.GET_ALL_MAPPINGS),
    batchAddMappings: (mappings) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.BATCH_ADD_MAPPINGS, { mappings }),
    updateMapping: (id, data) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.UPDATE_MAPPING, { id, data }),
    deleteMapping: (id) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.DELETE_MAPPING, { id }),
    exportMappings: () => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.EXPORT_MAPPINGS),
    getSellerSuggestions: (batchId) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.GET_SELLER_SUGGESTIONS, { batchId }),
    deduplicateMappings: () => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.DEDUPLICATE_MAPPINGS),
    // 发票 PDF 解析
    scanPdfFolder: (folderPath) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.SCAN_PDF_FOLDER, { folderPath }),
    parsePdfInvoices: (folderPath) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.PARSE_PDF_INVOICES, { folderPath }),
    exportInvoicesExcel: (folderPath, outputPath) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.EXPORT_INVOICES_EXCEL, { folderPath, outputPath }),
    importPdfInvoices: (batchId, invoices) => electron.ipcRenderer.invoke(RECONCILIATION_CHANNELS.IMPORT_PDF_INVOICES, { batchId, invoices }),
    // 进度事件监听
    onProgress: (callback) => {
      electron.ipcRenderer.on(RECONCILIATION_CHANNELS.PROGRESS, (_event, data) => callback(data));
      return () => electron.ipcRenderer.removeAllListeners(RECONCILIATION_CHANNELS.PROGRESS);
    }
  }
});
electron.contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args) {
    const [channel, listener] = args;
    return electron.ipcRenderer.on(channel, (event, ...args2) => listener(event, ...args2));
  },
  off(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.off(channel, ...omit);
  },
  send(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.send(channel, ...omit);
  },
  invoke(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.invoke(channel, ...omit);
  }
});
