
/**
 * Debug script for PDF invoice parsing
 * usage: npx tsx scripts/debug-invoice-parse.ts <pdf-file-path>
 */

import { parseSingleInvoicePdf } from '../electron/services/invoiceParseService';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error('Usage: npx tsx scripts/debug-invoice-parse.ts <pdf-file-path>');
        process.exit(1);
    }

    if (!fs.existsSync(filePath)) {
        console.error('File not found:', filePath);
        process.exit(1);
    }

    console.log(`Analyzing file: ${filePath}`);
    const stats = fs.statSync(filePath);
    console.log(`Size: ${stats.size} bytes`);

    if (stats.size === 0) {
        console.error('File is empty (0 bytes)');
        return;
    }

    try {
        console.log('Parsing...');
        // Note: ensure we import from the TS source or compiled JS correctly.
        // Using tsx handles TS source directly.
        const result = await parseSingleInvoicePdf(filePath);

        console.log('\n--- Parse Result ---');
        if (result.success && result.invoice) {
            console.log(JSON.stringify(result.invoice, null, 2));

            if (!result.invoice.invoiceNumber && !result.invoice.amount) {
                console.warn('\nWARNING: Key fields (Invoice Number, Amount) are missing.');
                console.warn('This might be an image-based PDF (scanned) or have an unsupported layout.');
                console.warn('Note: The current parser only supports text-based PDFs (selectable text), not OCR.');
            } else {
                console.log('\nSUCCESS: Parsing looks good.');
            }
        } else {
            console.error('Parsing failed:', result.error || 'Unknown error');
        }

    } catch (error) {
        console.error('Error parsing PDF:', error);
    }
}

main().catch(console.error);
