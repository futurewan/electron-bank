/**
 * Analyze the generated invoice Excel file - output to file
 */
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const filePath = process.argv[2] || '/Users/taolijun/Downloads/对账/01发票/发票清单_2026-02-20_12-05-11.xlsx';
const outputFile = path.join(__dirname, 'analysis_result.txt');

let output = '';
function log(msg) { output += msg + '\n'; }

try {
    log(`Analyzing: ${path.basename(filePath)}`);

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    log(`Sheet: "${sheetName}", Rows: ${data.length}`);

    if (data.length > 0) {
        log('Columns: ' + Object.keys(data[0]).join(', '));
    }

    let stats = {
        total: data.length,
        missingBuyer: 0, missingSeller: 0, missingAmount: 0,
        missingTaxRate: 0, missingTaxAmount: 0, missingTotalAmount: 0,
        missingInvoiceNumber: 0, missingDate: 0, missingItemName: 0,
        suspiciousBuyer: 0, suspiciousSeller: 0,
    };
    let issues = [];

    data.forEach((row, idx) => {
        let rowIssues = [];
        const buyer = row['购买方'] || '';
        const seller = row['销售方名称'] || row['销售方'] || '';

        if (!buyer) { stats.missingBuyer++; rowIssues.push('购买方为空'); }
        else if (buyer.includes('销') || buyer.includes('售') || buyer.length > 50) {
            stats.suspiciousBuyer++; rowIssues.push(`购买方异常: "${buyer.substring(0, 60)}"`);
        }

        if (!seller) { stats.missingSeller++; rowIssues.push('销售方为空'); }
        else if (seller.includes('购') || seller.length > 50) {
            stats.suspiciousSeller++; rowIssues.push(`销售方异常: "${seller.substring(0, 60)}"`);
        }

        if (!row['金额'] && row['金额'] !== 0) { stats.missingAmount++; }
        if (!row['税额'] && row['税额'] !== 0) { stats.missingTaxAmount++; }
        if (!row['价税合计'] && row['价税合计'] !== 0) { stats.missingTotalAmount++; }
        if (!row['税率']) { stats.missingTaxRate++; }
        if (!row['发票号码']) { stats.missingInvoiceNumber++; }
        if (!row['开票日期']) { stats.missingDate++; }
        if (!row['项目名称']) { stats.missingItemName++; }

        if (rowIssues.length > 0) {
            issues.push({ row: idx + 1, file: row['源文件'] || `Row ${idx + 1}`, issues: rowIssues });
        }
    });

    const pct = (c) => stats.total ? Math.round(c / stats.total * 100) + '%' : '0%';

    log('\n=== 字段填充统计 ===');
    log(`总行数:        ${stats.total}`);
    log(`发票号码缺失:  ${stats.missingInvoiceNumber} (${pct(stats.missingInvoiceNumber)})`);
    log(`开票日期缺失:  ${stats.missingDate} (${pct(stats.missingDate)})`);
    log(`购买方缺失:    ${stats.missingBuyer} (${pct(stats.missingBuyer)})`);
    log(`购买方异常:    ${stats.suspiciousBuyer} (${pct(stats.suspiciousBuyer)})`);
    log(`销售方缺失:    ${stats.missingSeller} (${pct(stats.missingSeller)})`);
    log(`销售方异常:    ${stats.suspiciousSeller} (${pct(stats.suspiciousSeller)})`);
    log(`金额缺失:      ${stats.missingAmount} (${pct(stats.missingAmount)})`);
    log(`税率缺失:      ${stats.missingTaxRate} (${pct(stats.missingTaxRate)})`);
    log(`税额缺失:      ${stats.missingTaxAmount} (${pct(stats.missingTaxAmount)})`);
    log(`价税合计缺失:  ${stats.missingTotalAmount} (${pct(stats.missingTotalAmount)})`);
    log(`项目名称缺失:  ${stats.missingItemName} (${pct(stats.missingItemName)})`);

    if (issues.length > 0) {
        log('\n=== 异常行详情 ===');
        issues.slice(0, 30).forEach(item => {
            log(`[Row ${item.row}] ${item.file}`);
            item.issues.forEach(iss => log(`  -> ${iss}`));
        });
    }

    log('\n=== 全部行数据 ===');
    data.forEach((row, idx) => {
        log(`\n--- Row ${idx + 1}: ${row['源文件'] || ''} ---`);
        Object.entries(row).forEach(([key, val]) => {
            log(`  ${key}: ${val !== undefined && val !== null && val !== '' ? val : '(空)'}`);
        });
    });

} catch (e) {
    log(`ERROR: ${e.message}`);
    log(e.stack);
}

fs.writeFileSync(outputFile, output, 'utf-8');
console.log(`Written to ${outputFile}`);
