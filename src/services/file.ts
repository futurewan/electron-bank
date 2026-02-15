/**
 * 文件服务
 * 封装对 Electron 文件 API 的调用
 */
import type { FileInfo } from '../types/config'

/**
 * 导入结果
 */
export interface ImportResult {
  success: boolean
  canceled?: boolean
  filePath?: string
  originalPath?: string
  fileName?: string
  content?: string
  error?: string
}

/**
 * 检查 Electron API 是否可用
 */
function checkElectronAPI(): boolean {
  return typeof window !== 'undefined' && !!window.electron?.file
}

/**
 * 文件服务
 */
export const fileService = {
  /**
   * 导入文件
   */
  async import(type?: 'excel' | 'csv' | 'json'): Promise<ImportResult> {
    if (!checkElectronAPI()) {
      return { success: false, error: 'Electron API not available' }
    }
    return window.electron.file.import(type)
  },

  /**
   * 导出文件
   */
  async export(content: string, filename: string, type?: string): Promise<{ success: boolean; filePath?: string; error?: string }> {
    if (!checkElectronAPI()) {
      return { success: false, error: 'Electron API not available' }
    }
    return window.electron.file.export(content, filename, type)
  },

  /**
   * 列出导入的文件
   */
  async listImports(): Promise<FileInfo[]> {
    if (!checkElectronAPI()) {
      return []
    }
    const result = await window.electron.file.listImports()
    return result.success ? result.files : []
  },

  /**
   * 列出导出的文件
   */
  async listExports(): Promise<FileInfo[]> {
    if (!checkElectronAPI()) {
      return []
    }
    const result = await window.electron.file.listExports()
    return result.success ? result.files : []
  },

  /**
   * 删除文件
   */
  async delete(filePath: string): Promise<boolean> {
    if (!checkElectronAPI()) {
      return false
    }
    const result = await window.electron.file.delete(filePath)
    return result.success
  },

  /**
   * 打开文件选择对话框
   */
  async openDialog(options?: {
    title?: string
    filters?: Array<{ name: string; extensions: string[] }>
    multiple?: boolean
  }): Promise<string[]> {
    if (!checkElectronAPI()) {
      return []
    }
    const result = await window.electron.file.openDialog(options)
    return result.success && !result.canceled ? result.filePaths : []
  },

  /**
   * 打开保存文件对话框
   */
  async saveDialog(options?: {
    title?: string
    defaultPath?: string
    filters?: Array<{ name: string; extensions: string[] }>
  }): Promise<string | undefined> {
    if (!checkElectronAPI()) {
      return undefined
    }
    const result = await window.electron.file.saveDialog(options)
    return result.success && !result.canceled ? result.filePath : undefined
  },
}
