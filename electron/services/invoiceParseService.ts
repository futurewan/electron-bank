/**
 * 发票 PDF 解析服务
 * 从 PDF 发票中提取结构化信息（支持元数据提取 + 文字层正则提取）
 * 并支持批量解析和导出为 Excel
 */
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { PDFParse, VerbosityLevel } from 'pdf-parse'

// ============================================
// 类型定义
// ============================================

/**
 * 单张发票的结构化信息
 */
export interface InvoiceInfo {
    /** 源文件路径 */
    filePath: string
    /** 源文件名 */
    fileName: string
    /** 发票代码 */
    invoiceCode: string | null
    /** 发票号码 */
    invoiceNumber: string | null
    /** 开票日期 */
    invoiceDate: string | null
    /** 购买方名称 */
    buyerName: string | null
    /** 购买方税号 */
    buyerTaxId: string | null
    /** 销售方名称 */
    sellerName: string | null
    /** 销售方税号 */
    sellerTaxId: string | null
    /** 不含税金额 */
    amount: number | null
    /** 税额 */
    taxAmount: number | null
    /** 价税合计 */
    totalAmount: number | null
    /** 税率 */
    taxRate: string | null
    /** 发票类型 */
    invoiceType: string | null
    /** 项目名称/商品名称 */
    itemName: string | null
    /** 价税合计大写 */
    totalAmountChinese: string | null
    /** 解析来源 (metadata / textlayer / both) */
    parseSource: string
}

/**
 * 去重跳过记录
 */
export interface DuplicateRecord {
    fileName: string
    invoiceNumber: string | null
    reason: string  // '批次内重复' | '跨批次重复'
}

/**
 * 批量解析结果
 */
export interface BatchParseResult {
    success: boolean
    invoices: InvoiceInfo[]
    errors: Array<{ filePath: string; error: string }>
    duplicates: DuplicateRecord[]
    totalFiles: number
    successCount: number
    duplicateCount: number
    failCount: number
}

// ============================================
// PDF 解析核心逻辑
// ============================================

/**
 * 解析单个 PDF 发票文件
 */
export async function parseSingleInvoicePdf(filePath: string): Promise<{
    success: boolean
    invoice?: InvoiceInfo
    error?: string
}> {
    try {
        if (!fs.existsSync(filePath)) {
            return { success: false, error: `文件不存在: ${filePath}` }
        }

        const ext = path.extname(filePath).toLowerCase()
        if (ext !== '.pdf') {
            return { success: false, error: `不支持的文件格式: ${ext}，仅支持 PDF` }
        }

        const dataBuffer = fs.readFileSync(filePath)
        const data = new Uint8Array(dataBuffer)

        const parser = new PDFParse({
            data,
            verbosity: VerbosityLevel.ERRORS,
        })

        // load() 在类型定义中标记为 private，但运行时是唯一的初始化方式
        await (parser as any).load()

        const invoice: InvoiceInfo = {
            filePath,
            fileName: path.basename(filePath),
            invoiceCode: null,
            invoiceNumber: null,
            invoiceDate: null,
            buyerName: null,
            buyerTaxId: null,
            sellerName: null,
            sellerTaxId: null,
            amount: null,
            taxAmount: null,
            totalAmount: null,
            taxRate: null,
            invoiceType: null,
            itemName: null,
            totalAmountChinese: null,
            parseSource: 'none',
        }

        let hasMetadata = false
        let hasTextLayer = false

        // ========== 1. 从 PDF 元数据提取 ==========
        try {
            const info = await parser.getInfo()
            const custom = (info as any).info?.Custom || {}

            if (Object.keys(custom).length > 0) {
                hasMetadata = true

                // 常见的元数据字段名映射
                invoice.invoiceNumber = custom.InvoiceNumber || custom.invoiceNumber || custom.InvoiceNo || null
                invoice.sellerTaxId = custom.SellerIdNum || custom.SellerTaxId || custom.sellerIdNum || null

                // 开票日期
                const issueTime = custom.IssueTime || custom.issueTime || custom.InvoiceDate || null
                if (issueTime) {
                    invoice.invoiceDate = normalizeDate(issueTime)
                }

                // 金额
                const amountStr = custom.TotalAmWithoutTax || custom.totalAmountWithoutTax || null
                if (amountStr) invoice.amount = parseFloat(amountStr)

                const totalStr = custom['TotalTax-includedAmount'] || custom.TotalAmount || custom.totalAmount || null
                if (totalStr) invoice.totalAmount = parseFloat(totalStr)

                const taxStr = custom.TotalTaxAm || custom.TotalTax || custom.totalTax || null
                if (taxStr) invoice.taxAmount = parseFloat(taxStr)
            }
        } catch (e) {
            console.warn('[InvoiceParse] 元数据提取失败:', e)
        }

        // ========== 2. 使用 getText() 公开 API 提取文字层 ==========
        try {
            const textResult = await parser.getText() as any
            const fullText: string = textResult?.text || ''

            if (fullText && fullText.trim().length > 0) {
                hasTextLayer = true
                extractFieldsFromText(fullText, invoice)
            }
        } catch (e) {
            console.warn('[InvoiceParse] 文字层提取失败:', e)
        }

        // 设置解析来源
        if (hasMetadata && hasTextLayer) {
            invoice.parseSource = 'both'
        } else if (hasMetadata) {
            invoice.parseSource = 'metadata'
        } else if (hasTextLayer) {
            invoice.parseSource = 'textlayer'
        }

        await parser.destroy()

        return { success: true, invoice }
    } catch (error) {
        console.error('[InvoiceParse] 解析失败:', error)
        return { success: false, error: String(error) }
    }
}

/**
 * 从全文文本中用正则提取发票各字段
 */
function extractFieldsFromText(fullText: string, invoice: InvoiceInfo): void {
    const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean)

    // ---- 发票类型 ----
    const typeMatch = fullText.match(/(电子发票\([^)]+\)|增值税普通发票|增值税专用发票|全电发票)/)
    if (typeMatch) invoice.invoiceType = typeMatch[1]

    // ---- 发票代码（10-12位纯数字，通常在行首或"发票代码"后）----
    if (!invoice.invoiceCode) {
        const codeMatch = fullText.match(/发票代码[：:\s]*(\d{10,12})/)
        if (codeMatch) invoice.invoiceCode = codeMatch[1]
    }

    // ---- 发票号码（从文字层可能更精确）----
    if (!invoice.invoiceNumber) {
        const numMatch = fullText.match(/发票号码[：:\s]*(\d{8,20})/)
        if (numMatch) invoice.invoiceNumber = numMatch[1]
    }
    // 如果仍然没有，尝试匹配独立行中的长数字串（可能是发票号码）
    if (!invoice.invoiceNumber) {
        for (const line of lines) {
            if (/^\d{15,20}$/.test(line)) {
                invoice.invoiceNumber = line
                break
            }
        }
    }

    // ---- 开票日期 ----
    if (!invoice.invoiceDate) {
        const dateMatch = fullText.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/)
        if (dateMatch) {
            invoice.invoiceDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
        }
    }

    // ---- 购买方/销售方名称 ----
    // 找包含 "公司" "企业" 等关键词的行
    const companyLines = lines.filter(line =>
        /[\u4e00-\u9fa5]{2,}(公司|企业|集团|厂|研究所|研究院|事务所|中心|学校|大学|学院|医院|银行)/.test(line)
    )

    if (companyLines.length >= 2 && !invoice.buyerName && !invoice.sellerName) {
        invoice.buyerName = companyLines[0]
        invoice.sellerName = companyLines[1]
    } else if (companyLines.length === 1 && !invoice.sellerName) {
        invoice.sellerName = companyLines[0]
    }

    // ---- 税号（15-20位数字+大写字母）----
    const taxIdPattern = /[0-9A-Z]{15,20}/g
    const allTaxIds = fullText.match(taxIdPattern) || []
    // 过滤掉已知的发票号码
    const taxIds = allTaxIds.filter(id =>
        id !== invoice.invoiceNumber &&
        id !== invoice.invoiceCode &&
        /[A-Z]/.test(id) // 税号通常含有字母
    )

    if (taxIds.length >= 2) {
        if (!invoice.buyerTaxId) invoice.buyerTaxId = taxIds[0]
        if (!invoice.sellerTaxId) invoice.sellerTaxId = taxIds[1]
    } else if (taxIds.length === 1 && !invoice.sellerTaxId) {
        invoice.sellerTaxId = taxIds[0]
    }

    // ---- 项目/商品名称 ----
    // 在含有金额的行中找中文文本部分
    for (const line of lines) {
        // 格式: "项目名称\t金额\t税率\t税额"
        if (/\t/.test(line) && /[\d.]+/.test(line) && /[\u4e00-\u9fa5]/.test(line)) {
            const parts = line.split('\t').map(p => p.trim())
            const namePart = parts.find(p => /[\u4e00-\u9fa5]{2,}/.test(p) && !/[¥￥%]/.test(p))
            if (namePart && !invoice.itemName) {
                invoice.itemName = namePart
            }
        }
    }
    // 退而求其次：不含公司名也不含常见标签的中文行
    if (!invoice.itemName) {
        const labelPatterns = /^(名称|税号|地址|电话|开户行|账号|备注|收款人|复核|开票人|合计|发票|机器编号|校验码)/
        for (const line of lines) {
            if (
                /[\u4e00-\u9fa5]{2,}/.test(line) &&
                !labelPatterns.test(line) &&
                !/(公司|企业|集团|元.*分)/.test(line) &&
                !/(年.*月.*日)/.test(line) &&
                !/^[¥￥]/.test(line) &&
                line.length >= 2 && line.length <= 30
            ) {
                invoice.itemName = line
                break
            }
        }
    }

    // ---- 金额、税率、税额 ----
    // 格式通常是: "商品名 \t 金额 \t 税率 \t 税额"
    for (const line of lines) {
        const tabParts = line.split('\t').map(p => p.trim())
        if (tabParts.length >= 3) {
            const nums = tabParts.filter(p => /^[\d,.]+$/.test(p)).map(p => parseFloat(p.replace(/,/g, '')))
            const rateStr = tabParts.find(p => /\d+%/.test(p))

            if (nums.length >= 2) {
                if (invoice.amount === null) invoice.amount = nums[0]
                if (invoice.taxAmount === null) invoice.taxAmount = nums[nums.length - 1]
            }
            if (rateStr && !invoice.taxRate) {
                invoice.taxRate = rateStr
            }
        }
    }

    // ---- ¥ 开头的金额 ----
    const yenMatches = fullText.match(/[¥￥]([\d,.]+)/g)
    if (yenMatches && yenMatches.length >= 2) {
        const amounts = yenMatches.map(m => parseFloat(m.replace(/[¥￥,]/g, ''))).filter(n => !isNaN(n))
        if (invoice.amount === null && amounts[0]) invoice.amount = amounts[0]
        if (invoice.taxAmount === null && amounts[1]) invoice.taxAmount = amounts[1]
    }

    // ---- 价税合计大写 ----
    const chineseAmountMatch = fullText.match(/([零壹贰叁肆伍陆柒捌玖拾佰仟万亿元角分整]{4,})/)
    if (chineseAmountMatch) {
        invoice.totalAmountChinese = chineseAmountMatch[1]
    }

    // ---- 价税合计小写 ----
    if (invoice.totalAmount === null) {
        // 先尝试从金额+税额计算
        if (invoice.amount !== null && invoice.taxAmount !== null) {
            invoice.totalAmount = Math.round((invoice.amount + invoice.taxAmount) * 100) / 100
        } else {
            // 查找独立行中的纯数字（可能是价税合计）
            for (const line of lines) {
                if (/^\d+\.\d{2}$/.test(line.trim())) {
                    const num = parseFloat(line.trim())
                    if (num > 0 && (invoice.totalAmount === null || num > invoice.totalAmount)) {
                        invoice.totalAmount = num
                    }
                }
            }
        }
    }

    // ---- 税率（如果还没提取到）----
    if (!invoice.taxRate) {
        const taxRateMatch = fullText.match(/(\d{1,2})%/)
        if (taxRateMatch) invoice.taxRate = taxRateMatch[1] + '%'
    }
}

/**
 * 生成去重键：invoiceNumber 优先，fallback 到 sellerName+amount+invoiceDate
 */
function getDeduplicationKey(invoice: InvoiceInfo): string {
    if (invoice.invoiceNumber) {
        return `num:${invoice.invoiceNumber}`
    }
    // 组合键兜底
    const seller = (invoice.sellerName || '').trim()
    const amount = String(invoice.totalAmount ?? invoice.amount ?? '')
    const date = (invoice.invoiceDate || '').trim()
    return `combo:${seller}|${amount}|${date}`
}

/**
 * 批量解析文件夹中的 PDF 发票（含批次内去重）
 */
export async function batchParsePdfInvoices(
    folderPath: string,
    onProgress?: (current: number, total: number, fileName: string) => void,
): Promise<BatchParseResult> {
    const result: BatchParseResult = {
        success: true,
        invoices: [],
        errors: [],
        duplicates: [],
        totalFiles: 0,
        successCount: 0,
        duplicateCount: 0,
        failCount: 0,
    }

    if (!fs.existsSync(folderPath)) {
        return { ...result, success: false, errors: [{ filePath: folderPath, error: '文件夹不存在' }] }
    }

    // 扫描所有 PDF 文件
    const files = fs.readdirSync(folderPath).filter(f => {
        const ext = path.extname(f).toLowerCase()
        return ext === '.pdf' && !f.startsWith('.') // 排除隐藏文件
    })

    result.totalFiles = files.length

    if (files.length === 0) {
        return { ...result, success: false, errors: [{ filePath: folderPath, error: '文件夹中没有 PDF 文件' }] }
    }

    // 用于批次内去重的 Set
    const seenKeys = new Set<string>()
    // 暂存所有成功解析的发票（去重前）
    const parsedInvoices: InvoiceInfo[] = []

    // 逐个解析
    for (let i = 0; i < files.length; i++) {
        const fileName = files[i]
        const filePath = path.join(folderPath, fileName)

        onProgress?.(i + 1, files.length, fileName)

        try {
            const parseResult = await parseSingleInvoicePdf(filePath)

            if (parseResult.success && parseResult.invoice) {
                parsedInvoices.push(parseResult.invoice)
            } else {
                result.errors.push({ filePath, error: parseResult.error || '解析失败' })
                result.failCount++
            }
        } catch (error) {
            result.errors.push({ filePath, error: String(error) })
            result.failCount++
        }
    }

    // 批次内去重
    for (const invoice of parsedInvoices) {
        const dedupKey = getDeduplicationKey(invoice)

        if (seenKeys.has(dedupKey)) {
            // 重复，跳过
            const fileName = invoice.filePath
                ? path.basename(invoice.filePath)
                : invoice.invoiceNumber || '未知文件'
            result.duplicates.push({
                fileName,
                invoiceNumber: invoice.invoiceNumber || null,
                reason: '批次内重复',
            })
            result.duplicateCount++
        } else {
            seenKeys.add(dedupKey)
            result.invoices.push(invoice)
            result.successCount++
        }
    }

    result.success = result.successCount > 0

    return result
}

// ============================================
// Excel 导出
// ============================================

/**
 * 将发票数据导出为 Excel 文件
 */
export function exportInvoicesToExcel(
    invoices: InvoiceInfo[],
    outputPath: string,
): { success: boolean; filePath?: string; error?: string } {
    try {
        // 转换为 Excel 友好的格式
        const excelData = invoices.map((inv, index) => ({
            '序号': index + 1,
            '发票号码': inv.invoiceNumber || '',
            '发票代码': inv.invoiceCode || '',
            '开票日期': inv.invoiceDate || '',
            '发票类型': inv.invoiceType || '',
            '购买方': inv.buyerName || '',
            '购买方税号': inv.buyerTaxId || '',
            '销售方名称': inv.sellerName || '',
            '销售方税号': inv.sellerTaxId || '',
            '项目名称': inv.itemName || '',
            '金额': inv.amount ?? '',
            '税率': inv.taxRate || '',
            '税额': inv.taxAmount ?? '',
            '价税合计': inv.totalAmount ?? '',
            '价税合计(大写)': inv.totalAmountChinese || '',
            '源文件': inv.fileName,
        }))

        const ws = XLSX.utils.json_to_sheet(excelData)

        // 设置列宽
        ws['!cols'] = [
            { wch: 5 },   // 序号
            { wch: 22 },  // 发票号码
            { wch: 14 },  // 发票代码
            { wch: 12 },  // 开票日期
            { wch: 22 },  // 发票类型
            { wch: 28 },  // 购买方
            { wch: 22 },  // 购买方税号
            { wch: 28 },  // 销售方
            { wch: 22 },  // 销售方税号
            { wch: 20 },  // 项目名称
            { wch: 14 },  // 金额
            { wch: 8 },   // 税率
            { wch: 12 },  // 税额
            { wch: 14 },  // 价税合计
            { wch: 26 },  // 价税合计大写
            { wch: 22 },  // 源文件
        ]

        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, '发票清单')

        // 确保输出目录存在
        const outputDir = path.dirname(outputPath)
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true })
        }

        // 使用 fs.writeFileSync 直接写入 buffer，避免 xlsx 库在 Electron 环境下的路径判断问题
        const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })
        fs.writeFileSync(outputPath, buffer)

        console.log(`[InvoiceParse] Excel 导出成功: ${outputPath}，共 ${invoices.length} 条记录`)

        return { success: true, filePath: outputPath }
    } catch (error) {
        console.error('[InvoiceParse] Excel 导出失败:', error)
        return { success: false, error: String(error) }
    }
}

/**
 * 扫描文件夹中的 PDF 文件列表
 */
export function scanPdfFiles(folderPath: string): {
    success: boolean
    files: Array<{ name: string; path: string; size: number; modifiedAt: Date }>
    error?: string
} {
    try {
        if (!fs.existsSync(folderPath)) {
            return { success: false, files: [], error: '文件夹不存在' }
        }

        const entries = fs.readdirSync(folderPath, { withFileTypes: true })
        const pdfFiles = entries
            .filter(entry => entry.isFile() && path.extname(entry.name).toLowerCase() === '.pdf' && !entry.name.startsWith('.'))
            .map(entry => {
                const fullPath = path.join(folderPath, entry.name)
                const stat = fs.statSync(fullPath)
                return {
                    name: entry.name,
                    path: fullPath,
                    size: stat.size,
                    modifiedAt: stat.mtime,
                }
            })
            .filter(file => file.size > 0) // 过滤空文件
            .sort((a, b) => a.name.localeCompare(b.name))

        return { success: true, files: pdfFiles }
    } catch (error) {
        return { success: false, files: [], error: String(error) }
    }
}

// ============================================
// 辅助函数
// ============================================

/**
 * 规范化日期字符串
 */
function normalizeDate(dateStr: string): string | null {
    if (!dateStr) return null

    // "2026年01月26日" → "2026-01-26"
    const match = dateStr.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/)
    if (match) {
        return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
    }

    // "2026-01-26" 或 "2026/01/26"
    const match2 = dateStr.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/)
    if (match2) {
        return `${match2[1]}-${match2[2].padStart(2, '0')}-${match2[3].padStart(2, '0')}`
    }

    return dateStr
}
