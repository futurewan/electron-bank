/**
 * 工作目录路径工具
 * 提供工作目录下各子目录的路径计算（常量拼接）
 */
import path from 'node:path'

// ============================================
// 子目录名称常量
// ============================================

/** 归档文件夹名称 */
export const ARCHIVE_DIR_NAME = '00归档'

/** 发票文件夹名称 */
export const INVOICE_DIR_NAME = '01发票'

/** 银行流水文件夹名称 */
export const BANK_STATEMENT_DIR_NAME = '02银行流水'

/** 归档子目录名称 */
export const ARCHIVE_SUB_DIRS = {
    INVOICES: '发票',
    BANK_STATEMENTS: '银行流水',
    AI_REPORTS: 'AI比对报告',
} as const

// ============================================
// 路径计算函数
// ============================================

/**
 * 获取归档文件夹路径
 */
export function getArchivePath(workspaceFolder: string): string {
    return path.join(workspaceFolder, ARCHIVE_DIR_NAME)
}

/**
 * 获取发票文件夹路径
 */
export function getInvoicePath(workspaceFolder: string): string {
    return path.join(workspaceFolder, INVOICE_DIR_NAME)
}

/**
 * 获取银行流水文件夹路径
 */
export function getBankStatementPath(workspaceFolder: string): string {
    return path.join(workspaceFolder, BANK_STATEMENT_DIR_NAME)
}

/**
 * 获取所有子目录路径
 */
export function getAllWorkspacePaths(workspaceFolder: string) {
    return {
        archive: getArchivePath(workspaceFolder),
        invoice: getInvoicePath(workspaceFolder),
        bankStatement: getBankStatementPath(workspaceFolder),
    }
}
