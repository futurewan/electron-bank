/**
 * 发票 PDF 解析服务
 * 从 PDF 发票中提取结构化信息（使用 Python pdfplumber 脚本 + 实时进度）
 * 并支持批量解析和导出为 Excel（Python pandas）
 */
import fs from 'node:fs'
import path from 'node:path'
import { eq, and, or, isNull } from 'drizzle-orm'
import { getDatabase } from '../database/client'
import { invoices } from '../database/schema'
import { pythonService } from './pythonService'
import { aiService } from './aiService'

// ============================================
// 类型定义
// ============================================

/**
 * 单张发票的结构化信息
 * （需与 models.py 中的 InvoiceInfo 保持一致）
 */
export interface InvoiceInfo {
    filePath: string
    fileName: string
    invoiceCode: string | null
    invoiceNumber: string | null
    invoiceDate: string | null
    buyerName: string | null
    buyerTaxId: string | null
    sellerName: string | null
    sellerTaxId: string | null
    amount: number | null
    taxAmount: number | null
    totalAmount: number | null
    taxRate: string | null
    invoiceType: string | null
    itemName: string | null
    totalAmountChinese: string | null
    // 解析来源 (metadata / textlayer / both) - 这里 Python 端返回的是 snake_case，需要注意映射
    parseSource: string
}

/**
 * 去重跳过记录
 */
export interface DuplicateRecord {
    fileName: string
    invoiceNumber: string | null
    reason: string
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

// 内部：Python 返回的数据结构（snake_case）
interface PythonInvoiceInfo {
    file_path: string
    file_name: string
    invoice_code: string | null
    invoice_number: string | null
    invoice_date: string | null
    buyer_name: string | null
    buyer_tax_id: string | null
    seller_name: string | null
    seller_tax_id: string | null
    amount: number | null
    tax_amount: number | null
    total_amount: number | null
    tax_rate: string | null
    invoice_type: string | null
    item_name: string | null
    total_amount_chinese: string | null
    parse_source: string
}

interface PythonBatchResult {
    success: boolean
    invoices: PythonInvoiceInfo[]
    errors: Array<{ file_path: string; error: string }>
    duplicates: Array<{ file_name: string; invoice_number: string | null; reason: string }>
    total_files: number
    success_count: number
    duplicate_count: number
    fail_count: number
}

// ============================================
// PDF 解析核心逻辑
// ============================================

/**
 * 批量解析文件夹中的 PDF 发票（含批次内去重）
 * 调用 Python 脚本处理
 */
export async function batchParsePdfInvoices(
    folderPath: string,
    onProgress?: (current: number, total: number, fileName: string) => void,
): Promise<BatchParseResult> {

    // 1. Check Python environment
    const envStatus = await pythonService.checkEnvironment();
    if (!envStatus.available) {
        return {
            success: false,
            invoices: [],
            errors: [{ filePath: folderPath, error: `Python 环境检查失败: ${envStatus.error || '缺少依赖'}` }],
            duplicates: [],
            totalFiles: 0,
            successCount: 0,
            duplicateCount: 0,
            failCount: 0,
        }
    }

    try {
        // 2. Run Python script
        // Note: Python script emits progress events to stdout if onProgress is provided to runScript
        // The final line will be the result JSON

        let finalResult: PythonBatchResult | null = null;

        console.log('[InvoiceParse] Starting Python script for folder:', folderPath);

        const output = await pythonService.runScript('main.py', ['parse', '--folder', folderPath], (event) => {
            if (event.type === 'progress') {
                onProgress?.(event.current, event.total, event.file);
            } else if (event.type === 'result') {
                // Intercept result event if emited as event
                console.log('[InvoiceParse] Received result event from Python, invoices:', event.data?.invoices?.length ?? 'N/A');
                finalResult = event.data;
            } else {
                console.log('[InvoiceParse] Unknown event type:', event.type, JSON.stringify(event).slice(0, 200));
            }
        });

        console.log('[InvoiceParse] Python script finished. finalResult set:', !!finalResult, ', stdout buffer length:', output?.length ?? 0);

        // If result wasn't captured in event stream (e.g. if script just printed it at end)
        // Check stdout capture (which runScript returns)
        // Our main.py prints json at the end.
        if (!finalResult) {
            console.log('[InvoiceParse] Trying to parse stdout buffer:', output?.slice(0, 500));
            try {
                const json = JSON.parse(output);
                if (json.type === 'result') {
                    finalResult = json.data;
                } else if (json.invoices) {
                    // Maybe it printed raw result?
                    finalResult = json;
                }
            } catch (e) {
                console.error("[InvoiceParse] Failed to parse Python output as JSON:", output?.slice(0, 500));
            }
        }

        if (!finalResult) {
            throw new Error("Failed to get result from Python script. Raw output: " + (output || '(empty)').slice(0, 200));
        }

        console.log('[InvoiceParse] Parse complete. Total:', finalResult.total_files, 'Success:', finalResult.success_count, 'Fail:', finalResult.fail_count);

        // 3. Convert Python snake_case to TypeScript camelCase
        return mapPythonResultToTs(finalResult);

    } catch (error: any) {
        console.error("[InvoiceParse] Python parse failed:", error);
        return {
            success: false,
            invoices: [],
            errors: [{ filePath: folderPath, error: error.message }],
            duplicates: [],
            totalFiles: 0,
            successCount: 0,
            duplicateCount: 0,
            failCount: 1,
        }
    }
}

function mapPythonResultToTs(pyResult: PythonBatchResult): BatchParseResult {
    return {
        success: pyResult.success,
        totalFiles: pyResult.total_files,
        successCount: pyResult.success_count,
        duplicateCount: pyResult.duplicate_count,
        failCount: pyResult.fail_count,
        invoices: pyResult.invoices.map(inv => ({
            filePath: inv.file_path,
            fileName: inv.file_name,
            invoiceCode: inv.invoice_code,
            invoiceNumber: inv.invoice_number,
            invoiceDate: inv.invoice_date,
            buyerName: inv.buyer_name,
            buyerTaxId: inv.buyer_tax_id,
            sellerName: inv.seller_name,
            sellerTaxId: inv.seller_tax_id,
            amount: inv.amount,
            taxAmount: inv.tax_amount,
            totalAmount: inv.total_amount,
            taxRate: inv.tax_rate,
            invoiceType: inv.invoice_type,
            itemName: inv.item_name,
            totalAmountChinese: inv.total_amount_chinese,
            parseSource: inv.parse_source
        })),
        errors: pyResult.errors.map(e => ({
            filePath: e.file_path,
            error: e.error
        })),
        duplicates: pyResult.duplicates.map(d => ({
            fileName: d.file_name,
            invoiceNumber: d.invoice_number,
            reason: d.reason
        }))
    }
}

// ============================================
// Excel 导出
// ============================================

/**
 * 将发票数据导出为 Excel 文件
 */
export async function exportInvoicesToExcel(
    invoices: InvoiceInfo[],
    outputPath: string,
): Promise<{ success: boolean; filePath?: string; error?: string }> {
    // 1. Check Python environment
    const envStatus = await pythonService.checkEnvironment();
    if (!envStatus.available) {
        return { success: false, error: `Python 环境检查失败: ${envStatus.error}` };
    }

    try {
        // Convert TS objects to Python-friendly dicts (mostly snake_case)
        const pythonInvoices = invoices.map(inv => ({
            file_path: inv.filePath,
            file_name: inv.fileName,
            invoice_code: inv.invoiceCode,
            invoice_number: inv.invoiceNumber,
            invoice_date: inv.invoiceDate,
            buyer_name: inv.buyerName,
            buyer_tax_id: inv.buyerTaxId,
            seller_name: inv.sellerName,
            seller_tax_id: inv.sellerTaxId,
            amount: inv.amount,
            tax_amount: inv.taxAmount,
            total_amount: inv.totalAmount,
            tax_rate: inv.taxRate,
            invoice_type: inv.invoiceType,
            item_name: inv.itemName,
            total_amount_chinese: inv.totalAmountChinese,
            parse_source: inv.parseSource
        }));

        const { spawn } = await import('node:child_process');
        const { app } = await import('electron');

        // Resolve Python path - check venv first, then fallback to system python3
        let scriptDir: string;
        if (app.isPackaged) {
            scriptDir = path.join(globalThis.process.resourcesPath, 'python');
        } else {
            scriptDir = path.join(globalThis.process.cwd(), 'electron/python');
        }

        // Resolve Python executable from unified service logic.
        // Packaged app must use bundled Python, never fallback to system python.
        const pyPath = pythonService.getPythonExecutable();
        if (!pyPath) {
            return { success: false, error: '打包环境缺少内置 Python 运行时（resources/python/.venv）' };
        }

        const scriptFile = path.join(scriptDir, 'main.py');
        if (!fs.existsSync(scriptFile)) {
            return { success: false, error: `Python script not found at ${scriptFile}` };
        }

        console.log(`[ExportExcel] Running: ${pyPath} ${scriptFile} export --output ${outputPath}`);

        return new Promise((resolve, _reject) => {
            const child = spawn(pyPath, [scriptFile, 'export', '--output', outputPath]);

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', d => stdout += d.toString());
            child.stderr.on('data', d => stderr += d.toString());

            child.on('close', code => {
                if (stderr) {
                    console.warn('[ExportExcel] stderr:', stderr.slice(0, 500));
                }
                if (code !== 0) {
                    resolve({ success: false, error: stderr || `Exited with code ${code}` });
                } else {
                    try {
                        const res = JSON.parse(stdout);
                        if (res.success) resolve({ success: true, filePath: res.file_path });
                        else resolve({ success: false, error: res.message });
                    } catch (e) {
                        resolve({ success: false, error: "Invalid JSON response from Python" });
                    }
                }
            });

            child.on('error', (err) => {
                console.error('[ExportExcel] Spawn error:', err);
                resolve({ success: false, error: err.message });
            });

            // Write invoice data to stdin
            child.stdin.write(JSON.stringify(pythonInvoices));
            child.stdin.end();
        });

    } catch (error: any) {
        console.error('[ExportExcel] Error:', error);
        return { success: false, error: error.message };
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

/**
 * AI 修复损坏的发票
 * 针对金额为0或销售方未知的发票，重新读取 PDF 文本并使用 AI 提取
 */
export async function repairBrokenInvoices(
    batchId: string,
    onProgress?: (current: number, total: number, message: string) => void
): Promise<{ repairedCount: number, failedCount: number }> {
    const db = getDatabase();

    // 1. Identify broken invoices
    // Criteria: amount = 0 OR sellerName is empty/unknown
    // And file path exists
    const brokenInvoices = await db.select()
        .from(invoices)
        .where(and(
            eq(invoices.batchId, batchId),
            or(
                eq(invoices.amount, 0),
                isNull(invoices.amount),
                eq(invoices.sellerName, ''),
                eq(invoices.sellerName, '未知销售方'),
                eq(invoices.sellerName, 'Unknown')
            )
        ));

    if (brokenInvoices.length === 0) {
        return { repairedCount: 0, failedCount: 0 };
    }

    console.log(`[AI Repair] Found ${brokenInvoices.length} broken invoices for batch ${batchId}`);

    let repaired = 0;
    let failed = 0;

    for (let i = 0; i < brokenInvoices.length; i++) {
        const inv = brokenInvoices[i];
        onProgress?.(i + 1, brokenInvoices.length, `正在修复: ${path.basename(inv.sourceFilePath || '未知文件')}`);

        if (!inv.sourceFilePath || !fs.existsSync(inv.sourceFilePath)) {
            console.warn(`[AI Repair] File not found for invoice ${inv.id}: ${inv.sourceFilePath}`);
            failed++;
            continue;
        }

        try {
            // 2. Extract raw text
            const rawText = await pythonService.extractText(inv.sourceFilePath);
            if (!rawText || rawText.length < 50) {
                console.warn(`[AI Repair] insufficient text extracted for ${inv.sourceFilePath}`);
                failed++;
                continue;
            }

            // 3. Construct Prompt
            const prompt = `
            You are an expert accountant. Extract the following fields from the invoice text below into JSON format:
            - invoiceCode (string)
            - invoiceNumber (string)
            - date (YYYY-MM-DD)
            - buyerName (string)
            - sellerName (string)
            - amount (number, price excluding tax)
            - taxAmount (number, tax amount)
            - totalAmount (number, price including tax)
            - itemName (string, main product/service name)

            Constraint: 
            - If field is missing, use null.
            - amount must be positive number.
            - sellerName should be the company name.
            
            Invoice Text:
            ${rawText.slice(0, 3000)}
            `;

            // 4. Call AI
            const result = await aiService.getJSON<any>(
                "Extract structured invoice data from text.",
                prompt,
                0.1 // Low temperature for extraction
            );

            // 5. Validate
            // Check if we got either amount or totalAmount > 0
            const validAmount = (result.amount > 0) || (result.totalAmount > 0);

            if (validAmount && result.sellerName) {
                // Determine the 'amount' to store in DB (should be total)
                const finalAmount = result.totalAmount || (result.amount + (result.taxAmount || 0));

                // Update DB
                await db.update(invoices)
                    .set({
                        amount: finalAmount, // Store Total Amount
                        sellerName: result.sellerName,
                        invoiceCode: result.invoiceCode || inv.invoiceCode,
                        invoiceNumber: result.invoiceNumber || inv.invoiceNumber,
                        invoiceDate: result.date ? new Date(result.date) : inv.invoiceDate,

                        // Optional fields
                        taxAmount: result.taxAmount || inv.taxAmount,
                        itemName: result.itemName || inv.itemName,

                        parseSource: 'ai_repair',
                        status: 'pending'
                    })
                    .where(eq(invoices.id, inv.id));

                repaired++;
                console.log(`[AI Repair] Repaired invoice ${inv.id}: ${finalAmount} / ${result.sellerName}`);
            } else {
                console.warn(`[AI Repair] AI returned invalid data for ${inv.id}`, result);
                failed++;
            }

        } catch (error) {
            console.error(`[AI Repair] Failed to repair invoice ${inv.id}:`, error);
            failed++;
        }
    }

    return { repairedCount: repaired, failedCount: failed };
}
