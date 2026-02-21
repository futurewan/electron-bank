# Design: Migrate PDF Parsing to Python

## Context

The current Invoice Parsing implementation uses `pdf-parse`, a pure JavaScript library that only extracts raw text from PDFs. This approach loses spatial layout information, making it difficult to accurately extract fields like "Buyer Name" or "Seller Name" which are often positioned in specific areas. Additionally, the Regex-based extraction logic is fragile and hard to maintain.

The requested change is to migrate this logic to **Python**, leveraging `pdfplumber` for layout-aware PDF extraction and `pandas` for robust Excel generation.

## Goals / Non-Goals

**Goals:**
- **Robust PDF Parsing**: Use `pdfplumber` to extract text with layout preservation (e.g., tables, specific coordinates).
- **Accurate Field Extraction**: Implement logic to identify invoice fields based on position and context, not just regex.
- **High-Quality Excel Export**: Use `pandas` and `openpyxl` to generate formatted Excel files.
- **Integration**: Seamlessly call Python scripts from the Electron Main process.
- **Batch Processing**: Efficiently process multiple files with a single Python process to minimize startup overhead.
- **Feedback**: Provide real-time progress updates from Python to the Electron UI.

**Non-Goals:**
- **Bundling Python Runtime**: We will not bundle a full Python environment (e.g., via PyInstaller) in this iteration. We assume the user has a working Python 3 environment.
- **OCR**: We will not implement OCR for image-only PDFs in this iteration (unless `pdfplumber` handles it easily, but it's not a primary goal).

## Decisions

### 1. Architecture: Child Process with Streaming Stdout
We will spawn a Python child process using Node.js `child_process.spawn`.
- **Input**: The Node.js process will pass the target folder path (or list of files) and configuration as JSON via `stdin` or command-line arguments.
- **Output**: The Python script will emit newline-delimited JSON events to `stdout`.
    - Progress events: `{"type": "progress", "current": 1, "total": 10, "file": "inv001.pdf"}`
    - Result events: `{"type": "result", "data": {...invoice_data...}}`
    - Error events: `{"type": "error", "message": "..."}`
- **Rationale**: This allows for real-time progress updates in the UI, which is crucial for batch processing, unlike `execFile` which buffers output.

### 2. Python Library Stack
- **PDF Parsing**: `pdfplumber`
    - *Why*: It provides bounding box data (`x0`, `top`, `x1`, `bottom`), which is essential for distinguishing between "Buyer" (usually top-left) and "Seller" (usually top-right or bottom).
- **Data Handling**: `pandas`
    - *Why*: Simplifies data manipulation and export to Excel.
- **Excel Export**: `openpyxl` (via pandas)
    - *Why*: Standard for writing `.xlsx` files with formatting.

### 3. Invoice Extraction Logic
The Python script (`invoice_parser.py`) will implement a class `InvoiceParser`:
- `extract_metadata()`: Attempt to read PDF metadata.
- `extract_text_content()`: Use `pdfplumber` to get text.
- `parse_fields()`:
    - distinct logic for "Full Digital Invoice" (structure is standard) vs "VAT Invoice".
    - Use spatial queries (e.g., `page.crop(bbox).extract_text()`) to target specific areas like the "Purchaser" block.
    - Fallback to regex if spatial extraction fails.

### 4. Excel Export Logic
The Python script will handling the export as well.
- Input: List of parsed invoice JSON objects.
- Output: `.xlsx` file at the specified path.

### 5. Configuration Management
We need to store the path to the Python executable.
- We will add a `pythonPath` setting in `electron-store`.
- Default to `python` or `python3` from PATH.
- Add a settings UI or capability to detect/set the Python path.

## Risks / Trade-offs

### Risk: Python Environment Missing
The user might not have Python installed or lacks the required libraries (`pdfplumber`, `pandas`).
- **Mitigation**:
  1. Add a `check_env.py` script.
  2. In the Electron app, run a "Health Check" on startup or before parsing.
  3. If check fails, display a clear error dialog with installation instructions: `pip install pdfplumber pandas openpyxl`.

### Trade-off: Performance vs. Accuracy
`pdfplumber` is slower than `pdf-parse` because it does more complex layout analysis.
- **Mitigation**: The accuracy gain outweighs the speed loss. Processing 50 invoices might take 10-20 seconds instead of 1 second, which is acceptable for this use case. We will use `multiprocessing` if single-threaded performance is too slow.

## Migration Plan

1.  **Setup**: Create `electron/python/` directory.
2.  **Implemenation**:
    - Write `electron/python/requirements.txt`.
    - Write `electron/python/invoice_parser.py`.
    - Write `electron/python/main.py` (CLI entry point).
3.  **Integration**:
    - Create `electron/services/pythonService.ts` to execute python commands.
    - Refactor `invoiceParseService.ts` to use `PythonService`.
4.  **Testing**:
    - Verify with sample PDFs.
    - Verify error handling (missing python, corrupt PDF).

## Open Questions

- Should we support "Legacy Mode" (Node.js parser) as a fallback?
    - *Decision*: No, keep the codebase clean. If we migrate, we commit to it. The old parser was too buggy to be worth keeping specific "legacy" code for.
