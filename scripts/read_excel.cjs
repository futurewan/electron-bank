/**
 * Analyze invoice Excel inline - output written by write_to_file tool
 */
const XLSX = require('/Users/taolijun/Documents/code/electron-bank/node_modules/xlsx');

const filePath = '/Users/taolijun/Downloads/对账/01发票/发票清单_2026-02-20_12-05-11.xlsx';

const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet);

// Write output as JSON for analysis
const result = {
    sheetName,
    rowCount: data.length,
    columns: data.length > 0 ? Object.keys(data[0]) : [],
    rows: data,
};

require('fs').writeFileSync(
    '/Users/taolijun/Documents/code/electron-bank/scripts/excel_data.json',
    JSON.stringify(result, null, 2),
    'utf-8'
);
