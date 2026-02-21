# Tasks: Enhance AI Matching Core

## 1. AI Foundation & Configuration

- [ ] 1.1 Implement `electron/services/aiService.ts` to encapsulate DeepSeek API logic (`callDeepSeek`).
    - [ ] Handle API configuration (key, endpoint, model) via `electron-store`.
    - [ ] Implement retry logic for 429 errors.
- [ ] 1.2 Update `electron/python/invoice_parser.py` to support `extract_text_for_llm` mode (raw text extraction).
- [ ] 1.3 Update `PythonService` to expose text extraction capability to `AIService`.

## 2. Capability: PDF Repair (AI Phase 1)

- [ ] 2.1 Implement `repairBrokenInvoices` in `electron/services/invoiceParseService.ts`.
    - [ ] Query database for broken invoices (`amount=0` OR `sellerName` invalid).
    - [ ] Call `pythonService` to get raw PDF text.
    - [ ] Call `aiService` with REPAIR_PROMPT to extract JSON.
    - [ ] Validate and update Invoice record (`parseSource='ai_repair'`, `amount`, etc.).
- [ ] 2.2 Add unit tests for `repairBrokenInvoices` logic (mocking AI response).

## 3. Capability: Semantic Matching (AI Phase 2)

- [ ] 3.1 Update `MatchResult` data model/database schema to support `matchType='ai'`, `confidence`, `reason`.
- [ ] 3.2 Implement `semanticMatch` in `electron/services/reconciliationService.ts`.
    - [ ] Filter candidate invoices (date ±30d, amount ±10%).
    - [ ] Construct SEMANTIC_MATCH_PROMPT with transaction context.
    - [ ] Call `aiService` to get decision.
    - [ ] Create `MatchResult` if confidence is high/medium.

## 4. Workflow Integration

- [ ] 4.1 Update main reconciliation pipeline in `reconciliationService.ts`.
    - [ ] Insert `repairBrokenInvoices` step before `exactMatch`.
    - [ ] Insert `semanticMatch` step after `fuzzyMatch`.
- [ ] 4.2 Update `BatchReconciliationResult` to include AI stats (`aiRepairedCount`, `aiMatchedCount`).

## 5. UI Updates & Verification

- [ ] 5.1 Add "AI Configuration" section in Settings page (API Key input).
- [ ] 5.2 Update Reconciliation Detail page to show AI match indicators (✨ icon, reason tooltip).
- [ ] 5.3 Manual Verification:
    - [ ] Test with a broken PDF (amount=0) -> Verify it gets repaired.
    - [ ] Test with a vague transaction -> Verify semantic match.
