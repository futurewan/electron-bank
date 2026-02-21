/**
 * IPC 通道常量定义
 * 所有主进程与渲染进程之间的通信通道
 */

/**
 * 数据库操作通道
 */
export const DB_CHANNELS = {
  QUERY: 'db:query',
  INSERT: 'db:insert',
  UPDATE: 'db:update',
  DELETE: 'db:delete',
  BATCH_INSERT: 'db:batch-insert',
} as const

/**
 * 配置操作通道
 */
export const CONFIG_CHANNELS = {
  GET: 'config:get',
  SET: 'config:set',
  GET_ALL: 'config:get-all',
  RESET: 'config:reset',
} as const

/**
 * 文件操作通道
 */
export const FILE_CHANNELS = {
  IMPORT: 'file:import',
  EXPORT: 'file:export',
  LIST_IMPORTS: 'file:list-imports',
  LIST_EXPORTS: 'file:list-exports',
  DELETE: 'file:delete',
  OPEN_DIALOG: 'file:open-dialog',
  SAVE_DIALOG: 'file:save-dialog',
  SELECT_FOLDER: 'file:select-folder',
  SCAN_FOLDER: 'file:scan-folder',
  INIT_WORKSPACE: 'file:init-workspace',
  VALIDATE_WORKSPACE: 'file:validate-workspace',
} as const

/**
 * AI 操作通道
 */
export const AI_CHANNELS = {
  SET_KEY: 'ai:set-key',
  CHECK_KEY: 'ai:check-key',
  REMOVE_KEY: 'ai:remove-key',
  GET_CONFIG: 'ai:get-config',
  SET_CONFIG: 'ai:set-config',
  ANALYZE: 'ai:analyze',
  // 流式响应使用事件
  STREAM_START: 'ai:stream-start',
  STREAM_CHUNK: 'ai:stream-chunk',
  STREAM_END: 'ai:stream-end',
  STREAM_ERROR: 'ai:stream-error',
} as const

/**
 * 应用通道
 */
export const APP_CHANNELS = {
  GET_VERSION: 'app:get-version',
  GET_PLATFORM: 'app:get-platform',
  OPEN_EXTERNAL: 'app:open-external',
  SHOW_IN_FOLDER: 'app:show-in-folder',
  OPEN_PATH: 'app:open-path',
} as const

/**
 * 核销操作通道
 */
export const RECONCILIATION_CHANNELS = {
  // 批次管理
  CREATE_BATCH: 'reconciliation:create-batch',
  GET_BATCH: 'reconciliation:get-batch',
  GET_ALL_BATCHES: 'reconciliation:get-all-batches',
  DELETE_BATCH: 'reconciliation:delete-batch',

  // 数据导入
  IMPORT_BANK_TRANSACTIONS: 'reconciliation:import-bank-transactions',
  IMPORT_INVOICES: 'reconciliation:import-invoices',
  IMPORT_PAYER_MAPPINGS: 'reconciliation:import-payer-mappings',
  PARSE_PDF_INVOICE: 'reconciliation:parse-pdf-invoice',

  // 付款人对应关系
  GET_PAYER_MAPPINGS: 'reconciliation:get-payer-mappings',
  ADD_PAYER_MAPPING: 'reconciliation:add-payer-mapping',

  // 规则匹配
  EXECUTE_RULE_MATCHING: 'reconciliation:execute-rule-matching',
  GET_MATCHING_STATS: 'reconciliation:get-matching-stats',
  GET_MATCH_RESULTS: 'reconciliation:get-match-results',
  CONFIRM_MATCH: 'reconciliation:confirm-match',

  // AI 匹配
  EXECUTE_AI_MATCHING: 'reconciliation:execute-ai-matching',
  STOP_RECONCILIATION: 'reconciliation:stop',
  EXTRACT_RELATIONS: 'reconciliation:extract-relations',

  // 异常检测
  DETECT_EXCEPTIONS: 'reconciliation:detect-exceptions',
  GET_EXCEPTIONS: 'reconciliation:get-exceptions',
  RESOLVE_EXCEPTION: 'reconciliation:resolve-exception',

  // 报告
  GET_REPORT_PREVIEW: 'reconciliation:get-report-preview',
  GENERATE_REPORT: 'reconciliation:generate-report',
  GET_ALL_REPORTS: 'reconciliation:get-all-reports',
  ARCHIVE_BATCH: 'reconciliation:archive',
  GET_BATCH_REPORTS: 'reconciliation:get-batch-reports',

  // 映射管理
  DETECT_PROXY_PAYMENTS: 'reconciliation:detect-proxy-payments',
  GET_ALL_MAPPINGS: 'reconciliation:get-all-mappings',
  BATCH_ADD_MAPPINGS: 'reconciliation:batch-add-mappings',
  UPDATE_MAPPING: 'reconciliation:update-mapping',
  DELETE_MAPPING: 'reconciliation:delete-mapping',
  EXPORT_MAPPINGS: 'reconciliation:export-mappings',
  DEDUPLICATE_MAPPINGS: 'reconciliation:deduplicate-mappings',
  GET_SELLER_SUGGESTIONS: 'reconciliation:get-seller-suggestions',

  // 发票 PDF 解析
  SCAN_PDF_FOLDER: 'reconciliation:scan-pdf-folder',
  PARSE_PDF_INVOICES: 'reconciliation:parse-pdf-invoices',
  EXPORT_INVOICES_EXCEL: 'reconciliation:export-invoices-excel',
  IMPORT_PDF_INVOICES: 'reconciliation:import-pdf-invoices',

  // 进度事件
  PROGRESS: 'reconciliation:progress',
} as const

/**
 * 所有通道的联合类型
 */
export type IpcChannel =
  | typeof DB_CHANNELS[keyof typeof DB_CHANNELS]
  | typeof CONFIG_CHANNELS[keyof typeof CONFIG_CHANNELS]
  | typeof FILE_CHANNELS[keyof typeof FILE_CHANNELS]
  | typeof AI_CHANNELS[keyof typeof AI_CHANNELS]
  | typeof APP_CHANNELS[keyof typeof APP_CHANNELS]
  | typeof RECONCILIATION_CHANNELS[keyof typeof RECONCILIATION_CHANNELS]

/**
 * 导出所有通道
 */
export const IPC_CHANNELS = {
  ...DB_CHANNELS,
  ...CONFIG_CHANNELS,
  ...FILE_CHANNELS,
  ...AI_CHANNELS,
  ...APP_CHANNELS,
  ...RECONCILIATION_CHANNELS,
} as const

