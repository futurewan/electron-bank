# Tasks: Migrate PDF Parsing to Python

## 1. Environment Setup

- [x] 1.1 Create `electron/python` directory and `requirements.txt` with dependencies (`pdfplumber`, `pandas`, `openpyxl`).
- [x] 1.2 Create `electron/python/check_env.py` to verify Python version and installed libraries.
- [x] 1.3 Create `electron/services/pythonService.ts` to handle process spawning, communication, and environment checks.

## 2. Python Implementation

- [x] 2.1 Implement `electron/python/models.py` to define Invoice data structures (matching TypeScript interfaces).
- [x] 2.2 Implement `electron/python/invoice_parser.py` using `pdfplumber` for layout-aware text extraction.
- [x] 2.3 Implement layout-based field extraction logic (Buyer, Seller, Items) in `invoice_parser.py`.
- [x] 2.4 Implement Excel export logic using `pandas` and `openpyxl`.
- [x] 2.5 Create `electron/python/main.py` as the CLI entry point handling arguments and streaming JSON output.

## 3. Electron Integration

- [x] 3.1 Refactor `electron/services/invoiceParseService.ts` to replace `pdf-parse` logic with calls to `PythonService`. for `batchParsePdfInvoices`.
- [x] 3.2 Refactor `electron/services/invoiceParseService.ts` to replace `xlsx` logic with calls to `pythonService` for `exportInvoicesToExcel`.
- [x] 3.3 Clean up `package.json` (remove `pdf-parse`, `xlsx`) and delete unused legacy code.

## 4. Verification

- [x] 4.1 Verify environment checks: Test app behavior when Python is missing or `pdfplumber` is not installed.
- [x] 4.2 Verify PDF parsing: Test with various PDF templates (digital, scanned) to ensure data extraction accuracy.
- [x] 4.3 Verify Excel export: Check if the exported Excel file is valid and contains correct data.
- [x] 4.4 Verify progress reporting: Ensure the progress bar updates correctly during batch processing. to UI.
