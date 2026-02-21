/**
 * 文件解析服务
 * 解析 Excel、CSV 和 PDF 文件
 */
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'

// ============================================
// 类型定义
// ============================================

/**
 * 银行流水解析结果
 */
export interface ParsedBankTransaction {
  transactionDate: Date | null
  payerName: string
  payerAccount: string | null
  amount: number
  remark: string | null
  transactionNo: string | null
}

/**
 * 发票解析结果
 */
export interface ParsedInvoice {
  invoiceCode: string | null
  invoiceNumber: string | null
  sellerName: string
  amount: number
  invoiceDate: Date | null
  buyerName: string | null
  buyerTaxId: string | null
  sellerTaxId: string | null
  taxAmount: number | null
  taxRate: string | null
  totalAmount: number | null
  itemNames: string | null
  remark: string | null
  issuer: string | null
  sourceFilePath: string | null
}

/**
 * 付款人对应关系解析结果
 */
export interface ParsedPayerMapping {
  personName: string
  companyName: string
  accountSuffix: string | null
  remark: string | null
}

/**
 * 解析错误
 */
export interface ParseError {
  row: number
  column?: string
  message: string
}

/**
 * 解析结果
 */
export interface ParseResult<T> {
  success: boolean
  data: T[]
  errors: ParseError[]
  totalRows: number
}

// ============================================
// 数据清洗函数
// ============================================

/**
 * 规范化户名
 * 去除空格、统一括号格式
 */
export function normalizeName(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .toString()
    .trim()
    .replace(/\s+/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[·•]/g, '')  // 移除人名中间的点
}

/**
 * 规范化金额
 * 处理货币符号、千分位、负数
 */
export function normalizeAmount(value: any): number {
  if (typeof value === 'number') {
    return Math.abs(value)
  }
  if (typeof value === 'string') {
    // 移除货币符号和千分位
    const cleaned = value
      .replace(/[¥$€￥]/g, '')
      .replace(/,/g, '')
      .replace(/，/g, '')
      .trim()
    const num = parseFloat(cleaned)
    return isNaN(num) ? 0 : Math.abs(num)
  }
  return 0
}

/**
 * Excel 日期序列号转 JS 日期
 */
function excelDateToJSDate(serial: number): Date {
  // Excel 日期起始于 1900-01-01，但有个 1900 年 2 月 bug
  const utc_days = Math.floor(serial - 25569)
  const utc_value = utc_days * 86400
  const date = new Date(utc_value * 1000)
  return date
}

/**
 * 规范化日期
 * 支持多种格式：Excel 序列号、字符串
 */
export function normalizeDate(value: any): Date | null {
  if (!value) return null

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value
  }

  if (typeof value === 'number') {
    // Excel 日期序列号
    return excelDateToJSDate(value)
  }

  if (typeof value === 'string') {
    const cleaned = value.trim()

    // 尝试各种格式
    // 2024-01-15
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
      return new Date(cleaned)
    }
    // 2024/01/15
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(cleaned)) {
      return new Date(cleaned.replace(/\//g, '-'))
    }
    // 20240115
    if (/^\d{8}$/.test(cleaned)) {
      const year = cleaned.substring(0, 4)
      const month = cleaned.substring(4, 6)
      const day = cleaned.substring(6, 8)
      return new Date(`${year}-${month}-${day}`)
    }
    // 01-15-2024 或 01/15/2024
    if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(cleaned)) {
      const parts = cleaned.split(/[-/]/)
      return new Date(`${parts[2]}-${parts[0]}-${parts[1]}`)
    }

    // 尝试直接解析
    const date = new Date(cleaned)
    return isNaN(date.getTime()) ? null : date
  }

  return null
}

// ============================================
// 字段映射
// ============================================

/**
 * 银行流水字段映射
 */
const BANK_FIELD_MAPPINGS: Record<string, string[]> = {
  transactionDate: ['交易日期', '日期', '记账日期', 'Date', 'Transaction Date', '交易时间'],
  payerName: ['对方户名', '交易对手', '付款人', '收款人', '对方名称', 'Payer', 'Counterparty'],
  payerAccount: ['对方账号', '账号', '对方账户', 'Account'],
  amount: ['交易金额', '金额', '发生额', '收入', '支出', 'Amount'],
  remark: ['备注', '摘要', '附言', '用途', 'Remark', 'Memo'],
  transactionNo: ['流水号', '交易流水号', '凭证号', 'Transaction No'],
}

/**
 * 发票字段映射
 */
const INVOICE_FIELD_MAPPINGS: Record<string, string[]> = {
  invoiceCode: ['发票代码', 'Invoice Code'],
  invoiceNumber: ['发票号码', 'Invoice Number', '发票号'],
  sellerName: ['销售方名称', '销方名称', '开票单位', '销售方', 'Seller'],
  sellerTaxId: ['销售方税号', '销方税号', 'Seller Tax ID'],
  buyerName: ['购买方名称', '购方名称', '购买方', '购方', 'Buyer'],
  buyerTaxId: ['购买方税号', '购方税号', 'Buyer Tax ID'],
  amount: ['金额', '不含税金额', 'Amount'], // Note: '金额' in new Excel is tax-exclusive
  taxAmount: ['税额', 'Tax Amount'],
  totalAmount: ['价税合计', '合计金额', 'Total Amount'],
  taxRate: ['税率', 'Tax Rate'],
  itemNames: ['项目名称', '货物名称', 'Item Name'],
  invoiceDate: ['开票日期', '日期', 'Invoice Date'],
  remark: ['备注', 'Remark'],
  issuer: ['开票人', 'Issuer'],
  sourceFilePath: ['源文件', '文件名称', '文件', 'Source File', 'FilePath']
}

/**
 * 付款人对应关系字段映射
 */
const PAYER_MAPPING_FIELDS: Record<string, string[]> = {
  personName: ['姓名', '付款人', '个人', 'Person', 'Name', '付款人名称'],
  companyName: ['公司', '对应公司', '企业名称', '关联公司', 'Company', '标准名称'],
  accountSuffix: ['账号尾号', '卡尾号', '账号后四位', 'Account Suffix'],
  remark: ['备注', '说明', '关系说明', 'Remark'],
}

/**
 * 从行数据中提取字段值
 */
function extractField(row: Record<string, any>, mappings: string[]): any {
  for (const key of mappings) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key]
    }
    // 尝试不区分大小写
    const lowerKey = key.toLowerCase()
    for (const rowKey of Object.keys(row)) {
      if (rowKey.toLowerCase() === lowerKey) {
        if (row[rowKey] !== undefined && row[rowKey] !== null && row[rowKey] !== '') {
          return row[rowKey]
        }
      }
    }
  }
  return null
}

// ============================================
// Excel/CSV 解析
// ============================================

/**
 * 智能读取表格工作表数据，自动识别表头
 */
function smartReadSheet(sheet: XLSX.WorkSheet, expectedKeywords: string[]): Record<string, any>[] {
  // 读取为 2D 数组
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: null })

  if (rows.length === 0) return []

  // 默认表头在第 0 行
  let headerRowIndex = 0
  let maxScore = 0

  // 扫描前 30 行寻找最优表头
  const scanLimit = Math.min(rows.length, 30)
  for (let i = 0; i < scanLimit; i++) {
    const row = rows[i]
    if (!Array.isArray(row)) continue

    let score = 0
    const rowStr = row.map(cell => String(cell || '').toLowerCase())
    for (const keyword of expectedKeywords) {
      const kwLower = keyword.toLowerCase()
      if (rowStr.some(cell => cell.includes(kwLower))) {
        score++
      }
    }

    if (score > maxScore) {
      maxScore = score
      headerRowIndex = i
    }
  }

  // 找到最佳表头后，使用 range 选项跳过前面的行
  // range 是数字时，表示起始的行索引（从 0 开始）
  return XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex })
}

/**
 * 读取 Excel 文件
 * @param filePath 文件路径
 * @param expectedKeywords 期望在表头找的关键词（用于智能识别带有开头废话的 Excel）
 */
export function readExcelFile(filePath: string, expectedKeywords?: string[]): Record<string, any>[] {
  try {
    const fileBuffer = fs.readFileSync(filePath)
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]

    if (expectedKeywords && expectedKeywords.length > 0) {
      return smartReadSheet(sheet, expectedKeywords)
    }
    return XLSX.utils.sheet_to_json(sheet)
  } catch (error) {
    throw new Error(`无法读取文件: ${error}`)
  }
}

/**
 * 读取 CSV 文件
 */
export function readCsvFile(filePath: string, expectedKeywords?: string[]): Record<string, any>[] {
  try {
    const fileBuffer = fs.readFileSync(filePath)
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]

    if (expectedKeywords && expectedKeywords.length > 0) {
      return smartReadSheet(sheet, expectedKeywords)
    }
    return XLSX.utils.sheet_to_json(sheet)
  } catch (error) {
    throw new Error(`无法读取 CSV 文件: ${error}`)
  }
}

/**
 * 解析银行流水文件
 */
export function parseBankTransactions(filePath: string): ParseResult<ParsedBankTransaction> {
  const ext = path.extname(filePath).toLowerCase()
  const data: ParsedBankTransaction[] = []
  const errors: ParseError[] = []

  const bankKeywords: string[] = []
  Object.values(BANK_FIELD_MAPPINGS).forEach(m => bankKeywords.push(...m))

  let rows: Record<string, any>[]
  try {
    if (ext === '.csv') {
      rows = readCsvFile(filePath, bankKeywords)
    } else if (ext === '.xlsx' || ext === '.xls') {
      rows = readExcelFile(filePath, bankKeywords)
    } else {
      return {
        success: false,
        data: [],
        errors: [{ row: 0, message: `不支持的文件格式: ${ext}` }],
        totalRows: 0,
      }
    }
  } catch (error) {
    return {
      success: false,
      data: [],
      errors: [{ row: 0, message: `文件读取失败: ${error}` }],
      totalRows: 0,
    }
  }

  rows.forEach((row, index) => {
    const rowNum = index + 2  // Excel 行号（从 2 开始，1 是表头）

    try {
      const payerName = normalizeName(extractField(row, BANK_FIELD_MAPPINGS.payerName))
      const amount = normalizeAmount(extractField(row, BANK_FIELD_MAPPINGS.amount))

      // 必填字段验证
      if (!payerName) {
        errors.push({ row: rowNum, column: '对方户名', message: '对方户名不能为空' })
        return
      }
      if (amount <= 0) {
        errors.push({ row: rowNum, column: '金额', message: '金额必须大于 0' })
        return
      }

      data.push({
        transactionDate: normalizeDate(extractField(row, BANK_FIELD_MAPPINGS.transactionDate)),
        payerName,
        payerAccount: extractField(row, BANK_FIELD_MAPPINGS.payerAccount)?.toString() || null,
        amount,
        remark: extractField(row, BANK_FIELD_MAPPINGS.remark)?.toString() || null,
        transactionNo: extractField(row, BANK_FIELD_MAPPINGS.transactionNo)?.toString() || null,
      })
    } catch (error) {
      errors.push({ row: rowNum, message: `解析错误: ${error}` })
    }
  })

  return {
    success: errors.length === 0,
    data,
    errors,
    totalRows: rows.length,
  }
}

/**
 * 解析发票文件（Excel）
 */
export function parseInvoices(filePath: string): ParseResult<ParsedInvoice> {
  const ext = path.extname(filePath).toLowerCase()
  const data: ParsedInvoice[] = []
  const errors: ParseError[] = []

  const invoiceKeywords: string[] = []
  Object.values(INVOICE_FIELD_MAPPINGS).forEach(m => invoiceKeywords.push(...m))

  let rows: Record<string, any>[]
  try {
    if (ext === '.csv') {
      rows = readCsvFile(filePath, invoiceKeywords)
    } else if (ext === '.xlsx' || ext === '.xls') {
      rows = readExcelFile(filePath, invoiceKeywords)
    } else {
      return {
        success: false,
        data: [],
        errors: [{ row: 0, message: `不支持的文件格式: ${ext}` }],
        totalRows: 0,
      }
    }
  } catch (error) {
    return {
      success: false,
      data: [],
      errors: [{ row: 0, message: `文件读取失败: ${error}` }],
      totalRows: 0,
    }
  }

  rows.forEach((row, index) => {
    const rowNum = index + 2

    try {
      const sellerName = normalizeName(extractField(row, INVOICE_FIELD_MAPPINGS.sellerName))
      // Support '金额' (exclusive) or '价税合计' (inclusive) as amount?
      // System usually expects 'amount' to be total amount or matches based on logic?
      // In database schema 'amount' is usually total amount.
      // Let's prefer totalAmount (价税合计) if available, otherwise amount.
      let amountVal = normalizeAmount(extractField(row, INVOICE_FIELD_MAPPINGS.totalAmount))
      if (amountVal <= 0) {
        amountVal = normalizeAmount(extractField(row, INVOICE_FIELD_MAPPINGS.amount))
      }

      // 必填字段验证
      if (!sellerName) {
        errors.push({ row: rowNum, column: '销售方名称', message: '销售方名称不能为空' })
        return
      }
      if (amountVal <= 0) {
        errors.push({ row: rowNum, column: '金额', message: '金额必须大于 0' })
        return
      }

      data.push({
        invoiceCode: extractField(row, INVOICE_FIELD_MAPPINGS.invoiceCode)?.toString() || null,
        invoiceNumber: extractField(row, INVOICE_FIELD_MAPPINGS.invoiceNumber)?.toString() || null,
        sellerName,
        amount: amountVal,
        invoiceDate: normalizeDate(extractField(row, INVOICE_FIELD_MAPPINGS.invoiceDate)),
        buyerName: extractField(row, INVOICE_FIELD_MAPPINGS.buyerName)?.toString() || null,
        buyerTaxId: extractField(row, INVOICE_FIELD_MAPPINGS.buyerTaxId)?.toString() || null,
        sellerTaxId: extractField(row, INVOICE_FIELD_MAPPINGS.sellerTaxId)?.toString() || null,
        taxAmount: normalizeAmount(extractField(row, INVOICE_FIELD_MAPPINGS.taxAmount)),
        taxRate: extractField(row, INVOICE_FIELD_MAPPINGS.taxRate)?.toString() || null,
        totalAmount: normalizeAmount(extractField(row, INVOICE_FIELD_MAPPINGS.totalAmount)),
        itemNames: extractField(row, INVOICE_FIELD_MAPPINGS.itemNames)?.toString() || null,
        remark: extractField(row, INVOICE_FIELD_MAPPINGS.remark)?.toString() || null,
        issuer: extractField(row, INVOICE_FIELD_MAPPINGS.issuer)?.toString() || null,
        sourceFilePath: extractField(row, INVOICE_FIELD_MAPPINGS.sourceFilePath)?.toString() || null,
      })
    } catch (error) {
      errors.push({ row: rowNum, message: `解析错误: ${error}` })
    }
  })

  return {
    success: errors.length === 0,
    data,
    errors,
    totalRows: rows.length,
  }
}

/**
 * 解析付款人对应关系文件
 */
export function parsePayerMappings(filePath: string): ParseResult<ParsedPayerMapping> {
  const ext = path.extname(filePath).toLowerCase()
  const data: ParsedPayerMapping[] = []
  const errors: ParseError[] = []

  const mappingKeywords: string[] = []
  Object.values(PAYER_MAPPING_FIELDS).forEach(m => mappingKeywords.push(...m))

  let rows: Record<string, any>[]
  try {
    if (ext === '.xlsx' || ext === '.xls') {
      rows = readExcelFile(filePath, mappingKeywords)
    } else {
      return {
        success: false,
        data: [],
        errors: [{ row: 0, message: `不支持的文件格式: ${ext}` }],
        totalRows: 0,
      }
    }
  } catch (error) {
    return {
      success: false,
      data: [],
      errors: [{ row: 0, message: `文件读取失败: ${error}` }],
      totalRows: 0,
    }
  }

  rows.forEach((row, index) => {
    const rowNum = index + 2

    try {
      const personName = normalizeName(extractField(row, PAYER_MAPPING_FIELDS.personName))
      const companyName = normalizeName(extractField(row, PAYER_MAPPING_FIELDS.companyName))

      // 必填字段验证
      if (!personName) {
        errors.push({ row: rowNum, column: '姓名', message: '姓名不能为空' })
        return
      }
      if (!companyName) {
        errors.push({ row: rowNum, column: '公司', message: '公司名称不能为空' })
        return
      }

      data.push({
        personName,
        companyName,
        accountSuffix: extractField(row, PAYER_MAPPING_FIELDS.accountSuffix)?.toString() || null,
        remark: extractField(row, PAYER_MAPPING_FIELDS.remark)?.toString() || null,
      })
    } catch (error) {
      errors.push({ row: rowNum, message: `解析错误: ${error}` })
    }
  })

  return {
    success: errors.length === 0,
    data,
    errors,
    totalRows: rows.length,
  }
}

// ============================================
// PDF 解析（基础文本提取）
// ============================================

/**
 * 读取 PDF 文本内容
 * 使用 AI 提取发票信息（在 AI 服务中实现）
 */
export async function readPdfText(filePath: string): Promise<string> {
  // 使用 require 导入 pdf-parse（CommonJS 模块）
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParse = require('pdf-parse')
  const dataBuffer = fs.readFileSync(filePath)
  const pdfData = await pdfParse(dataBuffer)
  return pdfData.text
}

/**
 * 检查文件是否存在
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath)
}

/**
 * 获取文件扩展名
 */
export function getFileExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase()
}

/**
 * 验证文件格式
 */
export function validateFileFormat(filePath: string, supportedFormats: string[]): boolean {
  const ext = getFileExtension(filePath)
  return supportedFormats.includes(ext)
}
