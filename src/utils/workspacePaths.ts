/**
 * 工作目录路径工具（前端版本）
 * 纯路径字符串拼接，不依赖 Node.js fs/path 模块
 */

/** 归档文件夹名称 */
export const ARCHIVE_DIR_NAME = '00归档'

/** 发票文件夹名称 */
export const INVOICE_DIR_NAME = '01发票'

/** 银行流水文件夹名称 */
export const BANK_STATEMENT_DIR_NAME = '02银行流水'

/**
 * 获取归档文件夹路径
 */
export function getArchivePath(workspaceFolder: string): string {
    return `${workspaceFolder}/${ARCHIVE_DIR_NAME}`
}

/**
 * 获取发票文件夹路径
 */
export function getInvoicePath(workspaceFolder: string): string {
    return `${workspaceFolder}/${INVOICE_DIR_NAME}`
}

/**
 * 获取银行流水文件夹路径
 */
export function getBankStatementPath(workspaceFolder: string): string {
    return `${workspaceFolder}/${BANK_STATEMENT_DIR_NAME}`
}
