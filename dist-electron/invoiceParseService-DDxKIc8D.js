import fs from "node:fs";
import path from "node:path";
import { u as utils, w as writeFileSync } from "./main-CaN3qA0o.js";
import { PDFParse, VerbosityLevel } from "pdf-parse";
async function parseSingleInvoicePdf(filePath) {
  var _a;
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `文件不存在: ${filePath}` };
    }
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== ".pdf") {
      return { success: false, error: `不支持的文件格式: ${ext}，仅支持 PDF` };
    }
    const dataBuffer = fs.readFileSync(filePath);
    const data = new Uint8Array(dataBuffer);
    const parser = new PDFParse({
      data,
      verbosity: VerbosityLevel.ERRORS
    });
    await parser.load();
    const invoice = {
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
      parseSource: "none"
    };
    let hasMetadata = false;
    let hasTextLayer = false;
    try {
      const info = await parser.getInfo();
      const custom = ((_a = info.info) == null ? void 0 : _a.Custom) || {};
      if (Object.keys(custom).length > 0) {
        hasMetadata = true;
        invoice.invoiceNumber = custom.InvoiceNumber || custom.invoiceNumber || custom.InvoiceNo || null;
        invoice.sellerTaxId = custom.SellerIdNum || custom.SellerTaxId || custom.sellerIdNum || null;
        const issueTime = custom.IssueTime || custom.issueTime || custom.InvoiceDate || null;
        if (issueTime) {
          invoice.invoiceDate = normalizeDate(issueTime);
        }
        const amountStr = custom.TotalAmWithoutTax || custom.totalAmountWithoutTax || null;
        if (amountStr) invoice.amount = parseFloat(amountStr);
        const totalStr = custom["TotalTax-includedAmount"] || custom.TotalAmount || custom.totalAmount || null;
        if (totalStr) invoice.totalAmount = parseFloat(totalStr);
        const taxStr = custom.TotalTaxAm || custom.TotalTax || custom.totalTax || null;
        if (taxStr) invoice.taxAmount = parseFloat(taxStr);
      }
    } catch (e) {
      console.warn("[InvoiceParse] 元数据提取失败:", e);
    }
    try {
      const textResult = await parser.getText();
      const fullText = (textResult == null ? void 0 : textResult.text) || "";
      if (fullText && fullText.trim().length > 0) {
        hasTextLayer = true;
        extractFieldsFromText(fullText, invoice);
      }
    } catch (e) {
      console.warn("[InvoiceParse] 文字层提取失败:", e);
    }
    if (hasMetadata && hasTextLayer) {
      invoice.parseSource = "both";
    } else if (hasMetadata) {
      invoice.parseSource = "metadata";
    } else if (hasTextLayer) {
      invoice.parseSource = "textlayer";
    }
    await parser.destroy();
    return { success: true, invoice };
  } catch (error) {
    console.error("[InvoiceParse] 解析失败:", error);
    return { success: false, error: String(error) };
  }
}
function extractFieldsFromText(fullText, invoice) {
  const lines = fullText.split("\n").map((l) => l.trim()).filter(Boolean);
  const typeMatch = fullText.match(/(电子发票\([^)]+\)|增值税普通发票|增值税专用发票|全电发票)/);
  if (typeMatch) invoice.invoiceType = typeMatch[1];
  if (!invoice.invoiceCode) {
    const codeMatch = fullText.match(/发票代码[：:\s]*(\d{10,12})/);
    if (codeMatch) invoice.invoiceCode = codeMatch[1];
  }
  if (!invoice.invoiceNumber) {
    const numMatch = fullText.match(/发票号码[：:\s]*(\d{8,20})/);
    if (numMatch) invoice.invoiceNumber = numMatch[1];
  }
  if (!invoice.invoiceNumber) {
    for (const line of lines) {
      if (/^\d{15,20}$/.test(line)) {
        invoice.invoiceNumber = line;
        break;
      }
    }
  }
  if (!invoice.invoiceDate) {
    const dateMatch = fullText.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (dateMatch) {
      invoice.invoiceDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`;
    }
  }
  const companyLines = lines.filter(
    (line) => /[\u4e00-\u9fa5]{2,}(公司|企业|集团|厂|研究所|研究院|事务所|中心|学校|大学|学院|医院|银行)/.test(line)
  );
  if (companyLines.length >= 2 && !invoice.buyerName && !invoice.sellerName) {
    invoice.buyerName = companyLines[0];
    invoice.sellerName = companyLines[1];
  } else if (companyLines.length === 1 && !invoice.sellerName) {
    invoice.sellerName = companyLines[0];
  }
  const taxIdPattern = /[0-9A-Z]{15,20}/g;
  const allTaxIds = fullText.match(taxIdPattern) || [];
  const taxIds = allTaxIds.filter(
    (id) => id !== invoice.invoiceNumber && id !== invoice.invoiceCode && /[A-Z]/.test(id)
    // 税号通常含有字母
  );
  if (taxIds.length >= 2) {
    if (!invoice.buyerTaxId) invoice.buyerTaxId = taxIds[0];
    if (!invoice.sellerTaxId) invoice.sellerTaxId = taxIds[1];
  } else if (taxIds.length === 1 && !invoice.sellerTaxId) {
    invoice.sellerTaxId = taxIds[0];
  }
  for (const line of lines) {
    if (/\t/.test(line) && /[\d.]+/.test(line) && /[\u4e00-\u9fa5]/.test(line)) {
      const parts = line.split("	").map((p) => p.trim());
      const namePart = parts.find((p) => /[\u4e00-\u9fa5]{2,}/.test(p) && !/[¥￥%]/.test(p));
      if (namePart && !invoice.itemName) {
        invoice.itemName = namePart;
      }
    }
  }
  if (!invoice.itemName) {
    const labelPatterns = /^(名称|税号|地址|电话|开户行|账号|备注|收款人|复核|开票人|合计|发票|机器编号|校验码)/;
    for (const line of lines) {
      if (/[\u4e00-\u9fa5]{2,}/.test(line) && !labelPatterns.test(line) && !/(公司|企业|集团|元.*分)/.test(line) && !/(年.*月.*日)/.test(line) && !/^[¥￥]/.test(line) && line.length >= 2 && line.length <= 30) {
        invoice.itemName = line;
        break;
      }
    }
  }
  for (const line of lines) {
    const tabParts = line.split("	").map((p) => p.trim());
    if (tabParts.length >= 3) {
      const nums = tabParts.filter((p) => /^[\d,.]+$/.test(p)).map((p) => parseFloat(p.replace(/,/g, "")));
      const rateStr = tabParts.find((p) => /\d+%/.test(p));
      if (nums.length >= 2) {
        if (invoice.amount === null) invoice.amount = nums[0];
        if (invoice.taxAmount === null) invoice.taxAmount = nums[nums.length - 1];
      }
      if (rateStr && !invoice.taxRate) {
        invoice.taxRate = rateStr;
      }
    }
  }
  const yenMatches = fullText.match(/[¥￥]([\d,.]+)/g);
  if (yenMatches && yenMatches.length >= 2) {
    const amounts = yenMatches.map((m) => parseFloat(m.replace(/[¥￥,]/g, ""))).filter((n) => !isNaN(n));
    if (invoice.amount === null && amounts[0]) invoice.amount = amounts[0];
    if (invoice.taxAmount === null && amounts[1]) invoice.taxAmount = amounts[1];
  }
  const chineseAmountMatch = fullText.match(/([零壹贰叁肆伍陆柒捌玖拾佰仟万亿元角分整]{4,})/);
  if (chineseAmountMatch) {
    invoice.totalAmountChinese = chineseAmountMatch[1];
  }
  if (invoice.totalAmount === null) {
    if (invoice.amount !== null && invoice.taxAmount !== null) {
      invoice.totalAmount = Math.round((invoice.amount + invoice.taxAmount) * 100) / 100;
    } else {
      for (const line of lines) {
        if (/^\d+\.\d{2}$/.test(line.trim())) {
          const num = parseFloat(line.trim());
          if (num > 0 && (invoice.totalAmount === null || num > invoice.totalAmount)) {
            invoice.totalAmount = num;
          }
        }
      }
    }
  }
  if (!invoice.taxRate) {
    const taxRateMatch = fullText.match(/(\d{1,2})%/);
    if (taxRateMatch) invoice.taxRate = taxRateMatch[1] + "%";
  }
}
function getDeduplicationKey(invoice) {
  if (invoice.invoiceNumber) {
    return `num:${invoice.invoiceNumber}`;
  }
  const seller = (invoice.sellerName || "").trim();
  const amount = String(invoice.totalAmount ?? invoice.amount ?? "");
  const date = (invoice.invoiceDate || "").trim();
  return `combo:${seller}|${amount}|${date}`;
}
async function batchParsePdfInvoices(folderPath, onProgress) {
  const result = {
    success: true,
    invoices: [],
    errors: [],
    duplicates: [],
    totalFiles: 0,
    successCount: 0,
    duplicateCount: 0,
    failCount: 0
  };
  if (!fs.existsSync(folderPath)) {
    return { ...result, success: false, errors: [{ filePath: folderPath, error: "文件夹不存在" }] };
  }
  const files = fs.readdirSync(folderPath).filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return ext === ".pdf" && !f.startsWith(".");
  });
  result.totalFiles = files.length;
  if (files.length === 0) {
    return { ...result, success: false, errors: [{ filePath: folderPath, error: "文件夹中没有 PDF 文件" }] };
  }
  const seenKeys = /* @__PURE__ */ new Set();
  const parsedInvoices = [];
  for (let i = 0; i < files.length; i++) {
    const fileName = files[i];
    const filePath = path.join(folderPath, fileName);
    onProgress == null ? void 0 : onProgress(i + 1, files.length, fileName);
    try {
      const parseResult = await parseSingleInvoicePdf(filePath);
      if (parseResult.success && parseResult.invoice) {
        parsedInvoices.push(parseResult.invoice);
      } else {
        result.errors.push({ filePath, error: parseResult.error || "解析失败" });
        result.failCount++;
      }
    } catch (error) {
      result.errors.push({ filePath, error: String(error) });
      result.failCount++;
    }
  }
  for (const invoice of parsedInvoices) {
    const dedupKey = getDeduplicationKey(invoice);
    if (seenKeys.has(dedupKey)) {
      const fileName = invoice.filePath ? path.basename(invoice.filePath) : invoice.invoiceNumber || "未知文件";
      result.duplicates.push({
        fileName,
        invoiceNumber: invoice.invoiceNumber || null,
        reason: "批次内重复"
      });
      result.duplicateCount++;
    } else {
      seenKeys.add(dedupKey);
      result.invoices.push(invoice);
      result.successCount++;
    }
  }
  result.success = result.successCount > 0;
  return result;
}
function exportInvoicesToExcel(invoices, outputPath) {
  try {
    const excelData = invoices.map((inv, index) => ({
      "序号": index + 1,
      "发票号码": inv.invoiceNumber || "",
      "发票代码": inv.invoiceCode || "",
      "开票日期": inv.invoiceDate || "",
      "发票类型": inv.invoiceType || "",
      "购买方": inv.buyerName || "",
      "购买方税号": inv.buyerTaxId || "",
      "销售方名称": inv.sellerName || "",
      "销售方税号": inv.sellerTaxId || "",
      "项目名称": inv.itemName || "",
      "金额": inv.amount ?? "",
      "税率": inv.taxRate || "",
      "税额": inv.taxAmount ?? "",
      "价税合计": inv.totalAmount ?? "",
      "价税合计(大写)": inv.totalAmountChinese || "",
      "源文件": inv.fileName
    }));
    const ws = utils.json_to_sheet(excelData);
    ws["!cols"] = [
      { wch: 5 },
      // 序号
      { wch: 22 },
      // 发票号码
      { wch: 14 },
      // 发票代码
      { wch: 12 },
      // 开票日期
      { wch: 22 },
      // 发票类型
      { wch: 28 },
      // 购买方
      { wch: 22 },
      // 购买方税号
      { wch: 28 },
      // 销售方
      { wch: 22 },
      // 销售方税号
      { wch: 20 },
      // 项目名称
      { wch: 14 },
      // 金额
      { wch: 8 },
      // 税率
      { wch: 12 },
      // 税额
      { wch: 14 },
      // 价税合计
      { wch: 26 },
      // 价税合计大写
      { wch: 22 }
      // 源文件
    ];
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "发票清单");
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    writeFileSync(wb, outputPath);
    console.log(`[InvoiceParse] Excel 导出成功: ${outputPath}，共 ${invoices.length} 条记录`);
    return { success: true, filePath: outputPath };
  } catch (error) {
    console.error("[InvoiceParse] Excel 导出失败:", error);
    return { success: false, error: String(error) };
  }
}
function scanPdfFiles(folderPath) {
  try {
    if (!fs.existsSync(folderPath)) {
      return { success: false, files: [], error: "文件夹不存在" };
    }
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    const pdfFiles = entries.filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".pdf" && !entry.name.startsWith(".")).map((entry) => {
      const fullPath = path.join(folderPath, entry.name);
      const stat = fs.statSync(fullPath);
      return {
        name: entry.name,
        path: fullPath,
        size: stat.size,
        modifiedAt: stat.mtime
      };
    }).filter((file) => file.size > 0).sort((a, b) => a.name.localeCompare(b.name));
    return { success: true, files: pdfFiles };
  } catch (error) {
    return { success: false, files: [], error: String(error) };
  }
}
function normalizeDate(dateStr) {
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }
  const match2 = dateStr.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (match2) {
    return `${match2[1]}-${match2[2].padStart(2, "0")}-${match2[3].padStart(2, "0")}`;
  }
  return dateStr;
}
export {
  batchParsePdfInvoices,
  exportInvoicesToExcel,
  parseSingleInvoicePdf,
  scanPdfFiles
};
