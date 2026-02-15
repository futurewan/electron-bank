/**
 * Electron API 全局类型声明
 * 声明通过 preload 暴露给渲染进程的 API
 */

import type { AIConfig, AppConfig, FileInfo } from './config'
import type { QueryFilter, QueryResult } from './database'

export interface ElectronAPI {
  /**
   * 数据库操作
   */
  db: {
    query: <T>(table: string, filter?: QueryFilter) => Promise<QueryResult<T>>
    insert: (table: string, data: Record<string, any>) => Promise<{ id: string }>
    update: (table: string, id: string, data: Record<string, any>) => Promise<{ success: boolean }>
    delete: (table: string, id: string) => Promise<{ success: boolean }>
    batchInsert: (table: string, items: Record<string, any>[]) => Promise<{ ids: string[] }>
  }

  /**
   * 配置操作
   */
  config: {
    get: <T>(key: string) => Promise<{ success: boolean; value?: T; error?: string }>
    set: (key: string, value: any) => Promise<{ success: boolean; error?: string }>
    getAll: () => Promise<{ success: boolean; config?: AppConfig; error?: string }>
    reset: () => Promise<{ success: boolean; error?: string }>
  }

  /**
   * 文件操作
   */
  file: {
    import: (type?: 'excel' | 'csv' | 'json') => Promise<{
      success: boolean
      canceled?: boolean
      filePath?: string
      originalPath?: string
      fileName?: string
      content?: string
      error?: string
    }>
    export: (content: string, filename: string, type?: string) => Promise<{
      success: boolean
      filePath?: string
      error?: string
    }>
    listImports: () => Promise<{
      success: boolean
      files: FileInfo[]
      error?: string
    }>
    listExports: () => Promise<{
      success: boolean
      files: FileInfo[]
      error?: string
    }>
    delete: (filePath: string) => Promise<{ success: boolean; error?: string }>
    openDialog: (options?: {
      title?: string
      filters?: Array<{ name: string; extensions: string[] }>
      multiple?: boolean
    }) => Promise<{
      success: boolean
      canceled: boolean
      filePaths: string[]
      error?: string
    }>
    saveDialog: (options?: {
      title?: string
      defaultPath?: string
      filters?: Array<{ name: string; extensions: string[] }>
    }) => Promise<{
      success: boolean
      canceled: boolean
      filePath?: string
      error?: string
    }>
    
    /**
     * 选择文件夹
     */
    selectFolder: (title?: string) => Promise<{
      success: boolean
      canceled: boolean
      folderPath?: string
      error?: string
    }>

    /**
     * 扫描文件夹
     */
    scanFolder: (folderPath: string) => Promise<{
      success: boolean
      files: {
        name: string
        path: string
        size: number
        modifiedAt: Date
      }[]
      hasMore: boolean
      error?: string
    }>
  }

  /**
   * AI 操作
   */
  ai: {
    setKey: (provider: string, apiKey: string) => Promise<{ success: boolean; error?: string }>
    checkKey: (provider: string) => Promise<{ valid: boolean; error?: string }>
    removeKey: (provider: string) => Promise<{ success: boolean; error?: string }>
    getConfig: () => Promise<{
      success: boolean
      config?: AIConfig
      error?: string
    }>
    setConfig: (config: Partial<Omit<AIConfig, 'hasApiKey' | 'totalTokensUsed' | 'lastUsedAt'>>) => Promise<{
      success: boolean
      error?: string
    }>
    analyze: (data: any, prompt: string) => Promise<{
      success: boolean
      result?: string
      tokens?: number
      model?: string
      error?: string
      errorType?: string
    }>
  }

  /**
   * 应用操作
   */
  app: {
    getVersion: () => Promise<string>
    getPlatform: () => Promise<string>
    openExternal: (url: string) => Promise<void>
    showInFolder: (filePath: string) => Promise<void>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    ipcRenderer: {
      on: (channel: string, listener: (event: any, ...args: any[]) => void) => void
      off: (channel: string, listener: (...args: any[]) => void) => void
      send: (channel: string, ...args: any[]) => void
      invoke: (channel: string, ...args: any[]) => Promise<any>
    }
  }
}

export { }

