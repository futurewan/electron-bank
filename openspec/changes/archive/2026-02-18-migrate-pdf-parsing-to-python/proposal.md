# Proposal: Migrate PDF Parsing and Excel Export to Python

## Why

The current Invoice Parsing implementation relies on Node.js libraries (`pdf-parse`, `xlsx`) which have proven to be immature and unstable for our needs. `pdf-parse` only extracts the raw text layer, losing layout information and often resulting in garbled text order that requires complex and fragile Regex to parse. `xlsx` (SheetJS) has limitations in styling and stability in the free version.

Migrating to a **Python-based solution** allows us to leverage the robust data science ecosystem. Python's `pdfplumber` offers superior PDF extraction (including table detection and layout preservation), and `pandas`/`openpyxl` provide professional-grade Excel manipulation. This change will significantly improve parsing accuracy, maintainability, and extensibility.

## What Changes

- **Architecture**:
  - Introduce a Python runtime integration. The Electron Main process will spawn and communicate with a Python script.
  - Create a new `python/` directory in `electron/` to house Python scripts.
- **Implementation**:
  - **Remove**: Delete `pdf-parse` and `xlsx` dependencies and the existing regex-based parsing logic in `invoiceParseService.ts`.
  - **Add**: Create `electron/python/invoice_parser.py` using `pdfplumber` for PDF extraction and `pandas` for Excel export.
  - **Update**: Refactor `invoiceParseService.ts` to act as a coordinator that invokes the Python script via `child_process`, passing file paths and receiving structured JSON results.
- **Data Processing**:
  - Logic for identifying "Buyer", "Seller", and "Items" will move from TypeScript Regex to Python, utilizing layout-aware extraction (e.g., checking x/y coordinates).

## Capabilities

### New Capabilities

- `python-integration`: Defines the architecture for managing the Python child process, including startup, communication (STDIN/STDOUT or HTTP), error handling, and environment management (checking for Python availability).

### Modified Capabilities

- `pdf-invoice-parse`: The core requirement to parse invoices remains, but the implementation constraints and success criteria will change. The spec will be updated to require Python-based extraction and explicitly support layout-based logic (e.g., "Extract table rows", "Identify fields by position").
- `invoice-export`: (Currently part of `pdf-invoice-parse`) The Excel export requirement will be updated to use Python's `pandas`/`openpyxl`, allowing for better formatting and stability.

## Impact

- **Code**: `electron/services/invoiceParseService.ts` will be almost entirely rewritten.
- **Dependencies**: New system requirement (Python 3.x with `pdfplumber`, `pandas`, `openpyxl`). User environment setup or bundling will be needed.
- **Performance**: Python process startup time may add slight latency; batch processing should be optimized (single process for multiple files).
