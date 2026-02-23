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

// ============================================
// 类型定义与辅助函数
// ============================================

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
 * 健壮的重命名/移动函数
 * 支持跨设备/分区移动（先复制后删除）
 */
function robustRename(src: string, dest: string): void {
  try {
    fs.renameSync(src, dest)
  } catch (error: any) {
    if (error.code === 'EXDEV') {
      // 跨设备移动：复制后删除
      fs.copyFileSync(src, dest)
      fs.unlinkSync(src)
    } else {
      throw error
    }
  }
}

/**
 * 归档批次原始文件与报告
 * @param batchId 批次ID
 * @param preCreatedArchiveInfo 可选：已预先创建的归档信息（避免生成重复目录）
 */
export async function archiveBatch(batchId: string, preCreatedArchiveInfo?: { dirPath: string; dirName: string }): Promise<ArchiveResult> {
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
    // 确定归档目录
    let archiveInfo: { dirPath: string; dirName: string }

    if (preCreatedArchiveInfo) {
      archiveInfo = preCreatedArchiveInfo
    } else {
      // 检查 batchId 是否已是 YYYYMMDD-N 格式 (如果是，可能已经归档过或指定了目录)
      if (/^\d{8}-\d+$/.test(batchId)) {
        const dirPath = path.join(getArchivePath(workspaceFolder), batchId)
        archiveInfo = { dirPath, dirName: batchId }
      } else {
        const nextInfo = getNextArchiveDir(workspaceFolder)
        archiveInfo = { dirPath: nextInfo.dirPath, dirName: nextInfo.dirName }
      }
    }

    createArchiveSubDirs(archiveInfo.dirPath)

    let movedCount = 0

    // 4. 移动银行流水文件
    const bankFolder = getBankStatementPath(workspaceFolder)
    if (fs.existsSync(bankFolder)) {
      try {
        const files = fs.readdirSync(bankFolder)
        const supportedExts = ['.xlsx', '.xls', '.csv', '.pdf']

        for (const file of files) {
          // 过滤临时文件
          if (file.startsWith('~$') || file.startsWith('.~') || file.startsWith('.')) {
            continue
          }

          const ext = path.extname(file).toLowerCase()
          if (supportedExts.includes(ext)) {
            const srcPath = path.join(bankFolder, file)
            // 确保是文件
            if (fs.statSync(srcPath).isFile()) {
              const destPath = path.join(archiveInfo.dirPath, ARCHIVE_SUB_DIRS.BANK_STATEMENTS, file)
              // 如果目标已存在，添加后缀
              let finalDestPath = destPath
              if (fs.existsSync(finalDestPath)) {
                const name = path.basename(file, ext)
                const timestamp = Date.now()
                finalDestPath = path.join(path.dirname(destPath), `${name}_${timestamp}${ext}`)
              }
              robustRename(srcPath, finalDestPath)
              movedCount++
            }
          }
        }
      } catch (e) {
        console.error(`[Archive] 移动银行流水失败:`, e)
      }
    }

    // 5. 移动发票文件
    const invoiceFolder = getInvoicePath(workspaceFolder)
    if (fs.existsSync(invoiceFolder)) {
      try {
        const invoiceFiles = fs.readdirSync(invoiceFolder).filter(f => !f.startsWith('.') && !f.startsWith('~$'))
        const supportedExts = ['.xlsx', '.xls', '.csv', '.pdf'] // Assuming same supported extensions for invoices

        for (const file of invoiceFiles) {
          const ext = path.extname(file).toLowerCase()
          if (supportedExts.includes(ext)) {
            const srcPath = path.join(invoiceFolder, file)
            if (fs.statSync(srcPath).isFile()) {
              const destPath = path.join(archiveInfo.dirPath, ARCHIVE_SUB_DIRS.INVOICES, file)
              // 如果目标已存在，添加后缀
              let finalDestPath = destPath
              if (fs.existsSync(finalDestPath)) {
                const name = path.basename(file, ext)
                const timestamp = Date.now()
                finalDestPath = path.join(path.dirname(destPath), `${name}_${timestamp}${ext}`)
              }
              robustRename(srcPath, finalDestPath)
              movedCount++
            }
          }
        }
      } catch (e) {
        console.error(`[Archive] 移动发票文件失败:`, e)
      }
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
