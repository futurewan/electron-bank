# 规格：对账工作流增强

## 简介
对现有的 `reconciliationService` 核心流程进行扩展，插入两个新的 AI 驱动阶段（PDF 修复与语义匹配），以增强发票数据的完整性和匹配的成功率。

## 更新后的对账流程 (Pipe)
工作流 SHALL 按以下顺序执行：

1. **Rule-Based Preprocessing**: (现有)
   - 清洗、标准化流水和发票数据。

2. **Wait for PDF Repair**: (新增 - AI Phase 1)
   - 触发 `repairBrokenInvoices`。
   - 等待修复完成（或跳过）。
   - 重新加载发票数据（此时包含修复后的 `amount` 和 `sellerName`）。

3. **Exact Matching**: (现有 - `matchMode='exact'`)
   - 规则：流水金额 == 发票金额。
   - 规则：流水日期 == 发票日期（严格）。

4. **Fuzzy Matching**: (现有 - `matchMode='fuzzy'`)
   - 规则：金额 ±X 元。
   - 规则：日期 ±Y 天。
   - 规则：摘要包含发票关键字。

5. **Semantic Matching**: (新增 - AI Phase 2)
   - 触发 `executeSemanticMatching`。
   - 针对未匹配的流水和发票。
   - 将 AI 建议作为 `pending_review` 状态保存。

6. **Wait for Manual Review**:
   - 如果开启了 `autoConfirmHighConfidence`，则自动确认高置信度匹配。
   - 否则，等待用户确认 AI 建议。

## 数据流变更
- **State Object**: `ReconciliationContext` 需包含 `aiRepairedCount` 和 `aiMatchedCount` 统计信息。
- **Run ID**: 整个对账过程应关联同一个 `batchId`，便于追踪 AI 操作日志。

## 异常处理
- 若 AI 服务不可用（API 错误/超时），工作流 SHALL 退回到仅规则匹配模式，并在结果中标记 `warnings: ['AI Service Unavailable']`。
- 不应因 AI 步骤失败而导致整个对账流程中断。
