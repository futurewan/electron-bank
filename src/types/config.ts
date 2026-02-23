/**
 * 应用配置类型定义
 */

/**
 * 窗口状态
 */
export interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized: boolean
}

/**
 * 应用配置
 */
export interface AppConfig {
  theme: 'light' | 'dark' | 'auto'
  language: 'zh-CN' | 'en-US'
  window: WindowState
  autoSave: boolean
  exportPath: string
  sidebarCollapsed: boolean
  recentFiles: string[]
  lastOpenedPath?: string
  bankStatementFolder?: string
  invoiceFolder?: string
  archiveFolder?: string
}

/**
 * AI 配置
 */
export interface AIConfig {
  provider: 'openai' | 'anthropic' | 'custom' | 'deepseek'
  model: string
  temperature: number
  maxTokens: number
  customEndpoint?: string
  totalTokensUsed: number
  lastUsedAt?: number
  hasApiKey: boolean
}

/**
 * 文件信息
 */
export interface FileInfo {
  name: string
  path: string
  size: number
  createdAt: Date
  modifiedAt: Date
}
