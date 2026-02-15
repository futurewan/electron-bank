/**
 * 文件夹服务
 * 提供文件夹选择和文件扫描功能
 */
import { dialog } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

/**
 * 文件信息
 */
export interface FileInfo {
  name: string
  path: string
  size: number
  modifiedAt: Date
}

/**
 * 打开文件夹选择对话框
 */
export async function selectFolder(title?: string): Promise<{
  success: boolean
  canceled: boolean
  folderPath?: string
}> {
  try {
    const result = await dialog.showOpenDialog({
      title: title || '选择文件夹',
      properties: ['openDirectory', 'createDirectory'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, canceled: true }
    }

    return {
      success: true,
      canceled: false,
      folderPath: result.filePaths[0],
    }
  } catch (error) {
    console.error('[FolderService] selectFolder error:', error)
    return { success: false, canceled: false }
  }
}

/**
 * 扫描文件夹内的 Excel 文件
 * 仅扫描顶层，最多返回 10 个文件
 */
export async function scanExcelFiles(folderPath: string): Promise<{
  success: boolean
  files: FileInfo[]
  hasMore: boolean
  error?: string
}> {
  try {
    // 检查文件夹是否存在
    if (!fs.existsSync(folderPath)) {
      return {
        success: false,
        files: [],
        hasMore: false,
        error: '文件夹不存在',
      }
    }

    // 读取文件夹内容
    const entries = fs.readdirSync(folderPath, { withFileTypes: true })

    // 过滤 Excel 文件
    const excelFiles: FileInfo[] = []
    const excelExtensions = ['.xlsx', '.xls']

    for (const entry of entries) {
      if (entry.isFile()) {
        if (entry.name.startsWith('~$') || entry.name.startsWith('.~')) {
          continue
        }

        const ext = path.extname(entry.name).toLowerCase()
        if (excelExtensions.includes(ext)) {
          const filePath = path.join(folderPath, entry.name)
          const stats = fs.statSync(filePath)

          excelFiles.push({
            name: entry.name,
            path: filePath,
            size: stats.size,
            modifiedAt: stats.mtime,
          })
        }
      }
    }

    // 按修改时间降序排序
    excelFiles.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime())

    // 限制数量
    const MAX_FILES = 10
    const hasMore = excelFiles.length > MAX_FILES
    const limitedFiles = excelFiles.slice(0, MAX_FILES)

    return {
      success: true,
      files: limitedFiles,
      hasMore,
    }
  } catch (error) {
    console.error('[FolderService] scanExcelFiles error:', error)
    return {
      success: false,
      files: [],
      hasMore: false,
      error: String(error),
    }
  }
}

// ============================================
// 工作目录管理
// ============================================

import {
  ARCHIVE_DIR_NAME,
  ARCHIVE_SUB_DIRS,
  BANK_STATEMENT_DIR_NAME,
  getAllWorkspacePaths,
  getArchivePath,
  INVOICE_DIR_NAME,
} from '../utils/workspacePaths'

/**
 * 初始化工作目录结构
 * 在根目录下创建 00归档、01发票、02银行流水 三个子文件夹（已存在则跳过）
 */
export function initWorkspaceStructure(rootPath: string): {
  success: boolean
  created: string[]
  error?: string
} {
  try {
    // 确保根目录存在
    if (!fs.existsSync(rootPath)) {
      fs.mkdirSync(rootPath, { recursive: true })
    }

    const subDirs = [ARCHIVE_DIR_NAME, INVOICE_DIR_NAME, BANK_STATEMENT_DIR_NAME]
    const created: string[] = []

    for (const dirName of subDirs) {
      const dirPath = path.join(rootPath, dirName)
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
        created.push(dirName)
        console.log(`[FolderService] Created: ${dirPath}`)
      }
    }

    return { success: true, created }
  } catch (error) {
    console.error('[FolderService] initWorkspaceStructure error:', error)
    return { success: false, created: [], error: String(error) }
  }
}

/**
 * 获取下一个归档目录路径
 * 格式: YYYYMMDD-N，N 为当天递增序号（取已有最大序号 +1）
 */
export function getNextArchiveDir(workspaceFolder: string): {
  dirPath: string
  dirName: string
  dateStr: string
  sequence: number
} {
  const archivePath = getArchivePath(workspaceFolder)

  // 确保归档根目录存在
  if (!fs.existsSync(archivePath)) {
    fs.mkdirSync(archivePath, { recursive: true })
  }

  // 当天日期 YYYYMMDD
  const now = new Date()
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`

  // 扫描已有的归档目录
  let maxSequence = 0
  try {
    const entries = fs.readdirSync(archivePath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(dateStr + '-')) {
        const seqStr = entry.name.substring(dateStr.length + 1)
        const seq = parseInt(seqStr, 10)
        if (!isNaN(seq) && seq > maxSequence) {
          maxSequence = seq
        }
      }
    }
  } catch (error) {
    console.error('[FolderService] Error scanning archive dir:', error)
  }

  const sequence = maxSequence + 1
  const dirName = `${dateStr}-${sequence}`
  const dirPath = path.join(archivePath, dirName)

  return { dirPath, dirName, dateStr, sequence }
}

/**
 * 在归档目录内创建子文件夹（发票、银行流水、AI比对报告）
 */
export function createArchiveSubDirs(archiveDirPath: string): void {
  if (!fs.existsSync(archiveDirPath)) {
    fs.mkdirSync(archiveDirPath, { recursive: true })
  }

  for (const subDir of Object.values(ARCHIVE_SUB_DIRS)) {
    const subDirPath = path.join(archiveDirPath, subDir)
    if (!fs.existsSync(subDirPath)) {
      fs.mkdirSync(subDirPath, { recursive: true })
    }
  }

  console.log(`[FolderService] Archive sub-dirs created: ${archiveDirPath}`)
}

/**
 * 验证工作目录及其子目录是否存在
 * 如不存在则自动重建，返回重建标记
 */
export function validateWorkspace(workspaceFolder: string): {
  valid: boolean
  rebuilt: boolean
  error?: string
} {
  try {
    const paths = getAllWorkspacePaths(workspaceFolder)
    let rebuilt = false

    // 检查根目录
    if (!fs.existsSync(workspaceFolder)) {
      fs.mkdirSync(workspaceFolder, { recursive: true })
      rebuilt = true
    }

    // 检查并重建子目录
    for (const dirPath of Object.values(paths)) {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
        rebuilt = true
      }
    }

    if (rebuilt) {
      console.log(`[FolderService] Workspace rebuilt: ${workspaceFolder}`)
    }

    return { valid: true, rebuilt }
  } catch (error) {
    console.error('[FolderService] validateWorkspace error:', error)
    return { valid: false, rebuilt: false, error: String(error) }
  }
}
