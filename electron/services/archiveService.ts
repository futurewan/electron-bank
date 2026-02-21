/**
 * 归档服务
 * 处理批次归档逻辑（基于工作目录模型）
 */
import * as fs from 'fs'
import * as path from 'path'
import { configStore } from '../config/store'
import { getBatch, updateBatchStatus } from './importService'
import {
  createArchiveSubDirs,
  getNextArchiveDir,
} from './folderService'
import { ARCHIVE_SUB_DIRS } from '../utils/workspacePaths'
import { getBankStatementPath, getInvoicePath, getArchivePath } from '../utils/workspacePaths'

/**
 * 归档结果
 */
export interface ArchiveResult {
  success: boolean
  archivePath?: string
  archiveDirName?: string
  movedFilesCount?: number
  error?: string
}

/**
 * 归档批次
 * 1. 在 00归档 下创建 YYYYMMDD-N 目录及子文件夹
 * 2. 移动源文件到归档目录
 * 3. 更新批次状态
 */
export async function archiveBatch(batchId: string): Promise<ArchiveResult> {
  try {
    // 1. 获取批次详情
    const batch = await getBatch(batchId)
    if (!batch) {
      return { success: false, error: '批次不存在' }
    }

    // 2. 获取工作目录配置
    const config = configStore.store
    const workspaceFolder = config.workspaceFolder

    if (!workspaceFolder) {
      return { success: false, error: '未配置工作目录' }
    }

    // 3. 创建归档目录
    // 逻辑变更：如果 batchId 符合 YYYYMMDD-N 格式，直接使用该名称作为归档文件夹名
    // 否则使用 getNextArchiveDir 生成新的
    let archiveInfo: { dirPath: string; dirName: string }

    if (/^\d{8}-\d+$/.test(batchId)) {
      const dirPath = path.join(getArchivePath(workspaceFolder), batchId)
      archiveInfo = { dirPath, dirName: batchId }
    } else {
      const nextInfo = getNextArchiveDir(workspaceFolder)
      archiveInfo = { dirPath: nextInfo.dirPath, dirName: nextInfo.dirName }
    }

    createArchiveSubDirs(archiveInfo.dirPath)

    let movedCount = 0

    // 4. 移动银行流水文件
    const bankFolder = getBankStatementPath(workspaceFolder)
    if (fs.existsSync(bankFolder)) {
      movedCount += moveFiles(
        bankFolder,
        path.join(archiveInfo.dirPath, ARCHIVE_SUB_DIRS.BANK_STATEMENTS)
      )
    }

    // 5. 移动发票文件
    const invoiceFolder = getInvoicePath(workspaceFolder)
    if (fs.existsSync(invoiceFolder)) {
      movedCount += moveFiles(
        invoiceFolder,
        path.join(archiveInfo.dirPath, ARCHIVE_SUB_DIRS.INVOICES)
      )
    }

    // 6. 更新状态
    await updateBatchStatus(batchId, 'archived')

    console.log(`[Archive] 批次 ${batchId} 已归档到 ${archiveInfo.dirName}，移动了 ${movedCount} 个文件`)

    return {
      success: true,
      archivePath: archiveInfo.dirPath,
      archiveDirName: archiveInfo.dirName,
      movedFilesCount: movedCount,
    }
  } catch (error) {
    console.error('[Archive] Error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 移动文件夹内的支持文件到目标目录
 */
function moveFiles(sourceDir: string, targetDir: string): number {
  let count = 0
  try {
    const files = fs.readdirSync(sourceDir)
    const supportedExts = ['.xlsx', '.xls', '.csv', '.pdf']

    for (const file of files) {
      // 过滤临时文件
      if (file.startsWith('~$') || file.startsWith('.~') || file.startsWith('.')) {
        continue
      }

      const ext = path.extname(file).toLowerCase()
      if (supportedExts.includes(ext)) {
        const srcPath = path.join(sourceDir, file)
        // 确保是文件
        if (fs.statSync(srcPath).isFile()) {
          const destPath = path.join(targetDir, file)

          // 如果目标已存在，添加后缀
          let finalDestPath = destPath
          if (fs.existsSync(finalDestPath)) {
            const name = path.basename(file, ext)
            const timestamp = Date.now()
            finalDestPath = path.join(targetDir, `${name}_${timestamp}${ext}`)
          }

          try {
            fs.renameSync(srcPath, finalDestPath)
            count++
          } catch (e) {
            console.error(`[Archive] Failed to move file ${file}:`, e)
            // 继续处理下一个文件，不中断
          }
        }
      }
    }
  } catch (error) {
    console.error(`[Archive] Failed to read source dir ${sourceDir}:`, error)
  }
  return count
}
