/**
 * 文件管理工具
 * 处理文件的读写、导入导出等操作
 */
import { dialog } from 'electron'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { AppDir, ensureDir, generateUniqueFilename, getAppDirPath, getDatedDirPath } from './paths'

/**
 * 文件类型
 */
export type ImportFileType = 'excel' | 'csv' | 'json'
export type ExportFileType = 'excel' | 'csv' | 'json' | 'pdf'

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

/**
 * 打开文件选择对话框
 */
export async function openFileDialog(options: {
  title?: string
  filters?: Electron.FileFilter[]
  multiple?: boolean
}): Promise<string[]> {
  const result = await dialog.showOpenDialog({
    title: options.title || '选择文件',
    filters: options.filters || [
      { name: 'Excel 文件', extensions: ['xlsx', 'xls'] },
      { name: 'CSV 文件', extensions: ['csv'] },
      { name: '所有文件', extensions: ['*'] },
    ],
    properties: options.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
  })
  
  return result.canceled ? [] : result.filePaths
}

/**
 * 打开保存文件对话框
 */
export async function saveFileDialog(options: {
  title?: string
  defaultPath?: string
  filters?: Electron.FileFilter[]
}): Promise<string | undefined> {
  const result = await dialog.showSaveDialog({
    title: options.title || '保存文件',
    defaultPath: options.defaultPath,
    filters: options.filters || [
      { name: 'Excel 文件', extensions: ['xlsx'] },
      { name: 'CSV 文件', extensions: ['csv'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  })
  
  return result.canceled ? undefined : result.filePath
}

/**
 * 保存文件到导入目录
 */
export async function saveToImports(
  sourceFilePath: string,
  keepOriginalName = false
): Promise<string> {
  // 获取带日期的目录
  const targetDir = getDatedDirPath(AppDir.Imports)
  ensureDir(targetDir)
  
  // 生成目标文件名
  const originalName = path.basename(sourceFilePath)
  const targetName = keepOriginalName ? originalName : generateUniqueFilename(originalName)
  const targetPath = path.join(targetDir, targetName)
  
  // 复制文件
  await fs.copyFile(sourceFilePath, targetPath)
  
  return targetPath
}

/**
 * 保存内容到导出目录
 */
export async function saveToExports(
  content: string | Buffer,
  filename: string
): Promise<string> {
  const targetDir = getDatedDirPath(AppDir.Exports)
  ensureDir(targetDir)
  
  const targetPath = path.join(targetDir, filename)
  await fs.writeFile(targetPath, content)
  
  return targetPath
}

/**
 * 读取文件内容
 */
export async function readFile(filePath: string): Promise<Buffer> {
  return fs.readFile(filePath)
}

/**
 * 读取文本文件
 */
export async function readTextFile(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
  return fs.readFile(filePath, { encoding })
}

/**
 * 写入文件
 */
export async function writeFile(filePath: string, content: string | Buffer): Promise<void> {
  await fs.writeFile(filePath, content)
}

/**
 * 删除文件
 */
export async function deleteFile(filePath: string): Promise<void> {
  await fs.unlink(filePath)
}

/**
 * 列出目录下的文件
 */
export async function listFiles(dirPath: string): Promise<FileInfo[]> {
  if (!fsSync.existsSync(dirPath)) {
    return []
  }
  
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const files: FileInfo[] = []
  
  for (const entry of entries) {
    if (entry.isFile()) {
      // 过滤临时文件
      if (entry.name.startsWith('~$') || entry.name.startsWith('.~')) {
        continue
      }
      
      const filePath = path.join(dirPath, entry.name)
      const stats = await fs.stat(filePath)
      files.push({
        name: entry.name,
        path: filePath,
        size: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
      })
    }
  }
  
  return files
}

/**
 * 列出导入目录的文件
 */
export async function listImportFiles(): Promise<FileInfo[]> {
  const importDir = getAppDirPath(AppDir.Imports)
  const allFiles: FileInfo[] = []
  
  if (!fsSync.existsSync(importDir)) {
    return []
  }
  
  // 遍历年月子目录
  const entries = await fs.readdir(importDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subDir = path.join(importDir, entry.name)
      const files = await listFiles(subDir)
      allFiles.push(...files)
    }
  }
  
  return allFiles.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime())
}

/**
 * 列出导出目录的文件
 */
export async function listExportFiles(): Promise<FileInfo[]> {
  const exportDir = getAppDirPath(AppDir.Exports)
  const allFiles: FileInfo[] = []
  
  if (!fsSync.existsSync(exportDir)) {
    return []
  }
  
  // 遍历年月子目录
  const entries = await fs.readdir(exportDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subDir = path.join(exportDir, entry.name)
      const files = await listFiles(subDir)
      allFiles.push(...files)
    }
  }
  
  return allFiles.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime())
}

/**
 * 清理过期文件
 */
export async function cleanupOldFiles(dir: AppDir, maxAgeDays: number): Promise<number> {
  const targetDir = getAppDirPath(dir)
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
  const now = Date.now()
  let deletedCount = 0
  
  if (!fsSync.existsSync(targetDir)) {
    return 0
  }
  
  const entries = await fs.readdir(targetDir, { withFileTypes: true })
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subDir = path.join(targetDir, entry.name)
      const files = await listFiles(subDir)
      
      for (const file of files) {
        if (now - file.modifiedAt.getTime() > maxAgeMs) {
          await deleteFile(file.path)
          deletedCount++
        }
      }
      
      // 如果子目录为空，删除子目录
      const remaining = await fs.readdir(subDir)
      if (remaining.length === 0) {
        await fs.rmdir(subDir)
      }
    }
  }
  
  return deletedCount
}
