/**
 * 报告生成服务
 * 生成对账结果报告（Excel 格式）
 * 
 * 报告类型：
 * 1. 自动入账凭证报告 — 双行合并表头
 * 2. 可解释性报告 — 5 列
 * 3. 异常情况处理报告 — 5 列
 */
import { and, desc, eq, inArray } from 'drizzle-orm'
import fs from 'node:fs'
import path from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import * as XLSX from 'xlsx'
import { getDatabase } from '../database/client'
import {
  bankTransactions,
  exceptions,
  invoices,
  matchResults,
  NewReport,
  reconciliationBatches,
  reports,
} from '../database/schema'
import { AppDir, getAppDirPath } from '../utils/paths'

// ============================================
// 类型定义
// ============================================

export interface ReportOptions {
  batchId: string
  outputDir?: string
  archiveDirName?: string  // 归档目录名(YYYYMMDD-N)，用于报告命名
}

export interface ReportResult {
  success: boolean
  files: string[]
  error?: string
}

// ============================================
// 工具函数
// ============================================

/**
 * 清理文件名中的非法字符
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[\\/?:*<>|"]/g, '_').trim()
}

/**
 * 将报告记录保存到数据库
 */
async function saveReportToDb(batchId: string, name: string, filePath: string, type: string) {
  const db = getDatabase()
  const report: NewReport = {
    id: uuidv4(),
    batchId,
    name,
    filePath,
    type,
    createdAt: new Date(),
  }
  await db.insert(reports).values(report)
  console.log(`[Report] 报告记录已存入数据库: ${name}`)
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date: any): string {
  if (!date) return ''
  try {
    if (date instanceof Date) {
      return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0]
    }
    const d = new Date(date)
    return isNaN(d.getTime()) ? String(date).split('T')[0] || '' : d.toISOString().split('T')[0]
  } catch {
    return String(date).split('T')[0] || ''
  }
}

/**
 * 安全写入 Excel 文件
 */
function writeExcelFile(wb: XLSX.WorkBook, filePath: string, outputDir: string): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  fs.writeFileSync(filePath, buf)
}

/**
 * 获取报告文件名前缀
 * 如果有归档目录名(YYYYMMDD-N)，用它作为前缀；否则用批次名
 */
function getReportPrefix(archiveDirName?: string, batchName?: string): string {
  if (archiveDirName) return archiveDirName
  return sanitizeFilename(batchName || 'report')
}

// ============================================
// 报告生成入口
// ============================================

/**
 * 生成所有报告（根据数据有无条件性生成）
 */
export async function generateReports(options: ReportOptions): Promise<ReportResult> {
  const { batchId, outputDir, archiveDirName } = options

  const db = getDatabase()
  const files: string[] = []

  // 获取批次信息
  const batch = await db.select()
    .from(reconciliationBatches)
    .where(eq(reconciliationBatches.id, batchId))
    .limit(1)

  if (!batch[0]) {
    return { success: false, files: [], error: '批次不存在' }
  }

  const batchName = batch[0].name || batchId.substring(0, 8)
  const prefix = getReportPrefix(archiveDirName, batchName)

  // 输出目录
  const targetDir = outputDir || path.join(getAppDirPath(AppDir.Exports), batchId)
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  console.log(`[Report] 开始生成报告, 输出目录: ${targetDir}`)

  try {
    // 1. 自动入账凭证报告（所有成功匹配）
    const filePath1 = await generateAutoEntryReport(batchId, prefix, targetDir)
    if (filePath1) {
      files.push(filePath1)
      await saveReportToDb(batchId, `${prefix}自动入账凭证报告`, filePath1, 'auto_entry')
    }

    // 2. 可解释性报告（tolerance/proxy/ai 的匹配记录）
    const filePath2 = await generateExplainableReport(batchId, prefix, targetDir)
    if (filePath2) {
      files.push(filePath2)
      await saveReportToDb(batchId, `${prefix}可解释性报告`, filePath2, 'explainable')
    }

    // 3. 异常情况处理报告
    const filePath3 = await generateExceptionReport(batchId, prefix, targetDir)
    if (filePath3) {
      files.push(filePath3)
      await saveReportToDb(batchId, `${prefix}异常情况处理报告`, filePath3, 'exceptions')
    }

    console.log(`[Report] 报告生成完成, 共 ${files.length} 个文件`)
    return { success: true, files }

  } catch (error) {
    console.error('[Report] 生成失败:', error)
    return { success: false, files, error: String(error) }
  }
}

// ============================================
// 自动入账凭证报告（双行合并表头）
// ============================================

/**
 * 生成自动入账凭证报告
 * 数据来源：所有 matchType 的成功匹配记录
 * 
 * 表头结构（双行合并）：
 * Row 1: 序号 | 交易日期 | 银行流水信息(资金流) [跨2列] | 关联单据信息(业务流) [跨2列] | 核销结果(AI产出) [跨2列]
 * Row 2:      |          | 对方户名/摘要 | 到账金额 | 客户名称/单据号 | 应收金额 | 核销金额 | 差额
 */
async function generateAutoEntryReport(
  batchId: string,
  prefix: string,
  outputDir: string
): Promise<string | null> {
  const db = getDatabase()

  // 获取所有成功匹配（perfect + tolerance + proxy + ai）
  const allMatches = await db.select()
    .from(matchResults)
    .where(and(
      eq(matchResults.batchId, batchId),
      inArray(matchResults.matchType, ['perfect', 'tolerance', 'proxy', 'ai'])
    ))

  if (allMatches.length === 0) {
    console.log('[Report] 无匹配记录，跳过自动入账凭证报告')
    return null
  }

  // 构建双行表头
  const headerRow1 = ['序号', '交易日期', '银行流水信息(资金流)', '', '关联单据信息(业务流)', '', '核销结果(AI产出)', '']
  const headerRow2 = ['', '', '对方户名/摘要', '到账金额', '客户名称/单据号', '应收金额', '核销金额', '差额']
  const rows: any[][] = [headerRow1, headerRow2]

  let index = 1
  for (const match of allMatches) {
    const bankTx = match.bankId
      ? (await db.select().from(bankTransactions).where(eq(bankTransactions.id, match.bankId)).limit(1))[0]
      : null
    const invoice = match.invoiceId
      ? (await db.select().from(invoices).where(eq(invoices.id, match.invoiceId)).limit(1))[0]
      : null

    if (bankTx && invoice) {
      const reconciledAmount = Math.min(bankTx.amount, invoice.amount)
      const diff = parseFloat((bankTx.amount - invoice.amount).toFixed(2))

      rows.push([
        index++,
        formatDate(bankTx.transactionDate),
        `${bankTx.payerName || ''}${bankTx.remark ? '/' + bankTx.remark : ''}`,
        bankTx.amount,
        `${invoice.sellerName || ''}${invoice.invoiceNumber ? '/' + invoice.invoiceNumber : ''}`,
        invoice.amount,
        reconciledAmount,
        diff,
      ])
    }
  }

  // 创建Excel
  const ws = XLSX.utils.aoa_to_sheet(rows)

  // 设置合并单元格
  ws['!merges'] = [
    // Row 1: 序号 (A1:A2)
    { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
    // Row 1: 交易日期 (B1:B2)
    { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
    // Row 1: 银行流水信息(资金流) (C1:D1)
    { s: { r: 0, c: 2 }, e: { r: 0, c: 3 } },
    // Row 1: 关联单据信息(业务流) (E1:F1)
    { s: { r: 0, c: 4 }, e: { r: 0, c: 5 } },
    // Row 1: 核销结果(AI产出) (G1:H1)
    { s: { r: 0, c: 6 }, e: { r: 0, c: 7 } },
  ]

  // 设置列宽
  ws['!cols'] = [
    { wch: 6 },   // 序号
    { wch: 12 },  // 交易日期
    { wch: 25 },  // 对方户名/摘要
    { wch: 12 },  // 到账金额
    { wch: 25 },  // 客户名称/单据号
    { wch: 12 },  // 应收金额
    { wch: 12 },  // 核销金额
    { wch: 10 },  // 差额
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '自动入账凭证报告')

  const filePath = path.join(outputDir, `${prefix}自动入账凭证报告.xlsx`)
  try {
    writeExcelFile(wb, filePath, outputDir)
  } catch (error: any) {
    console.error(`[Report] 无法保存自动入账凭证报告: ${filePath}`, error)
    throw new Error(`保存失败: ${error.message || '权限不足或磁盘空间不足'}`)
  }

  console.log(`[Report] 自动入账凭证报告: ${allMatches.length} 条`)
  return filePath
}

// ============================================
// 可解释性报告
// ============================================

/**
 * 生成可解释性报告
 * 数据来源：matchType 为 tolerance/proxy/ai 的匹配记录
 * 
 * 字段：关联序号 | AI匹配逻辑(Reasoning Chain) | 证据链(Evidence) | 置信度 | 状态
 */
async function generateExplainableReport(
  batchId: string,
  prefix: string,
  outputDir: string
): Promise<string | null> {
  const db = getDatabase()

  const explainableMatches = await db.select()
    .from(matchResults)
    .where(and(
      eq(matchResults.batchId, batchId),
      inArray(matchResults.matchType, ['tolerance', 'proxy', 'ai'])
    ))

  if (explainableMatches.length === 0) {
    console.log('[Report] 无可解释性匹配记录，跳过可解释性报告')
    return null
  }

  // 需要计算关联序号：从自动入账凭证报告的序号中找到对应位置
  // 先获取所有匹配记录以确定序号
  const allMatches = await db.select()
    .from(matchResults)
    .where(and(
      eq(matchResults.batchId, batchId),
      inArray(matchResults.matchType, ['perfect', 'tolerance', 'proxy', 'ai'])
    ))

  // 建立 matchId -> 序号映射
  const matchIndexMap = new Map<string, number>()
  allMatches.forEach((m, idx) => matchIndexMap.set(m.id, idx + 1))

  const typeLabels: Record<string, string> = {
    tolerance: '容差匹配（金额差异在容差范围内）',
    proxy: '代付匹配（存在代付关系）',
    ai: 'AI语义匹配（通过AI分析确认匹配）',
  }

  const rows: any[][] = [
    ['关联序号', 'AI匹配逻辑(Reasoning Chain)', '证据链(Evidence)', '置信度', '状态']
  ]

  for (const match of explainableMatches) {
    const seqNo = matchIndexMap.get(match.id) || '-'

    // 构建证据链
    let evidence = ''
    if (match.bankId && match.invoiceId) {
      const bankTx = (await db.select().from(bankTransactions).where(eq(bankTransactions.id, match.bankId)).limit(1))[0]
      const inv = (await db.select().from(invoices).where(eq(invoices.id, match.invoiceId)).limit(1))[0]
      if (bankTx && inv) {
        evidence = `银行流水: ${bankTx.payerName} ¥${bankTx.amount} | 发票: ${inv.sellerName} ¥${inv.amount} | 差额: ¥${match.amountDiff || 0}`
      }
    }

    rows.push([
      seqNo,
      `${typeLabels[match.matchType] || match.matchType}${match.reason ? ' - ' + match.reason : ''}`,
      evidence,
      match.confidence ? `${(match.confidence * 100).toFixed(2)}%` : '-',
      match.confirmed ? '✅ 已确认' : '⏳ 待确认',
    ])
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [
    { wch: 10 },  // 关联序号
    { wch: 45 },  // AI匹配逻辑
    { wch: 50 },  // 证据链
    { wch: 10 },  // 置信度
    { wch: 10 },  // 状态
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '可解释性报告')

  const filePath = path.join(outputDir, `${prefix}可解释性报告.xlsx`)
  try {
    writeExcelFile(wb, filePath, outputDir)
  } catch (error: any) {
    console.error(`[Report] 无法保存可解释性报告: ${filePath}`, error)
    throw new Error(`保存失败: ${error.message || '权限不足'}`)
  }

  console.log(`[Report] 可解释性报告: ${explainableMatches.length} 条`)
  return filePath
}

// ============================================
// 异常情况处理报告
// ============================================

/**
 * 生成异常情况处理报告
 * 数据来源：异常检测结果
 * 
 * 字段：风险等级 | 异常类型 | 银行流水详情 | AI诊断分析 | AI建议操作
 */
async function generateExceptionReport(
  batchId: string,
  prefix: string,
  outputDir: string
): Promise<string | null> {
  const db = getDatabase()

  const allExceptions = await db.select()
    .from(exceptions)
    .where(eq(exceptions.batchId, batchId))

  if (allExceptions.length === 0) {
    console.log('[Report] 无异常记录，跳过异常情况处理报告')
    return null
  }

  const typeLabels: Record<string, string> = {
    NO_INVOICE: '有水无票',
    NO_BANK_TXN: '有票无水',
    DUPLICATE_PAYMENT: '重复支付',
    AMOUNT_MISMATCH: '金额不符',
    SUSPICIOUS_PROXY: '可疑代付',
  }

  const severityLabels: Record<string, string> = {
    high: '🔴 高危',
    medium: '🟠 中危',
    low: '🟡 低危',
  }

  const rows: any[][] = [
    ['风险等级', '异常类型', '银行流水详情', 'AI诊断分析', 'AI建议操作']
  ]

  for (const exc of allExceptions) {
    // 解析银行流水详情
    let bankDetail = ''
    try {
      const parsed = JSON.parse(exc.detail || '{}')
      if (parsed.payerName) {
        bankDetail = `${parsed.payerName} ¥${parsed.amount || ''}`
        if (parsed.transactionDate) bankDetail += ` (${formatDate(parsed.transactionDate)})`
        if (parsed.remark) bankDetail += ` 备注: ${parsed.remark}`
      } else if (parsed.currentTx) {
        bankDetail = `${parsed.currentTx.payer || ''} ¥${parsed.currentTx.amount || ''}`
      } else {
        bankDetail = JSON.stringify(parsed).substring(0, 100)
      }
    } catch {
      bankDetail = exc.detail || ''
    }

    // AI诊断分析：从 detail JSON 中提取关键信息作为诊断
    let aiDiagnosis = ''
    try {
      const diagParsed = JSON.parse(exc.detail || '{}')
      if (diagParsed.diagnosis) {
        aiDiagnosis = diagParsed.diagnosis
      } else if (diagParsed.amountDiff !== undefined) {
        aiDiagnosis = `金额差异: ¥${diagParsed.amountDiff}`
      } else if (diagParsed.daysDiff !== undefined) {
        aiDiagnosis = `${diagParsed.daysDiff}天内出现相似交易`
      } else {
        aiDiagnosis = typeLabels[exc.type] || exc.type
      }
    } catch {
      aiDiagnosis = typeLabels[exc.type] || exc.type
    }

    rows.push([
      severityLabels[exc.severity] || exc.severity,
      typeLabels[exc.type] || exc.type,
      bankDetail,
      aiDiagnosis,
      exc.suggestion || '',
    ])
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [
    { wch: 10 },  // 风险等级
    { wch: 12 },  // 异常类型
    { wch: 40 },  // 银行流水详情
    { wch: 40 },  // AI诊断分析
    { wch: 30 },  // AI建议操作
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '异常情况处理报告')

  const filePath = path.join(outputDir, `${prefix}异常情况处理报告.xlsx`)
  try {
    writeExcelFile(wb, filePath, outputDir)
  } catch (error: any) {
    console.error(`[Report] 无法保存异常情况处理报告: ${filePath}`, error)
    throw new Error(`保存失败: ${error.message || '权限不足'}`)
  }

  console.log(`[Report] 异常情况处理报告: ${allExceptions.length} 条`)
  return filePath
}

// ============================================
// 报告查询
// ============================================

/**
 * 获取所有生成的报告
 */
export async function getReports() {
  const db = getDatabase()
  return db.select()
    .from(reports)
    .orderBy(desc(reports.createdAt))
}

/**
 * 获取指定批次的所有报告
 */
export async function getReportsByBatchId(batchId: string) {
  const db = getDatabase()
  return db.select()
    .from(reports)
    .where(eq(reports.batchId, batchId))
    .orderBy(desc(reports.createdAt))
}
