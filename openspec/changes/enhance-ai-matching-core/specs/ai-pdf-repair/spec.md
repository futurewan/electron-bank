# 规格：AI PDF 修复

## 目标
利用 LLM 的语义理解能力，针对正则表达式解析失败（例如金额为 0 或销售方未知）的 PDF 发票，重新提取关键结构化数据。

## 范围
- **输入**：解析状态为 `pending` 且数据不完整（`amount=0` 或 `sellerName` 为空/未知）的发票记录。
- **处理**：调用 LLM API 分析 PDF 原始文本。
- **输出**：更新后的发票记录，包含修正后的金额、销售方、日期等信息。

## 数据要求

### 目标发票筛选
系统 SHALL 仅对满足以下条件的发票执行 AI 修复：
1. `amount` 等于 0 或 `null`。
2. `sellerName` 为空、`null` 或包含 "未知"、"unknown" 字样。
3. `parseSource` 不为 `manual`（避免覆盖人工修正）。

### LLM 输入 (Prompt) context
系统 SHALL 向 LLM 提供以下信息：
1. **任务指令**：提取 JSON 格式的发票关键字段。
2. **原始文本**：PDF 的前 3000 个字符（通常包含抬头和金额信息）。
3. **约束**：
    - 输出纯 JSON。
    - 日期格式 `YYYY-MM-DD`。
    - 金额为纯数字（去除货币符号）。

### LLM 输出结构
期望的 JSON 结构：
```json
{
  "invoiceCode": "...",
  "invoiceNumber": "...",
  "date": "YYYY-MM-DD",
  "buyerName": "...",
  "sellerName": "...",
  "amount": 100.00,
  "totalAmount": 106.00,
  "itemName": "..."
}
```

## 处理逻辑

### 修复流程
1. **扫描**：查询数据库中所有符合筛选条件的发票。
2. **提取**：读取对应 PDF 文件的文本层（复用 `pdf-parse` 或 `pdfplumber` 结果）。
3. **调用**：发送 Prompt 到配置的 LLM 服务。
4. **验证**：
    - 解析返回的 JSON。
    - 验证 `amount > 0`。
    - 验证 `date` 格式合法。
5. **更新**：
    - 更新数据库中的发票记录。
    - 设置 `parseSource` = `'ai_repair'`。
    - 设置 `updatedAt` = 当前时间。
6. **记录**：记录修复日志（ID，修复前金额，修复后金额，耗时）。

### 异常处理
- 若 LLM 返回无效 JSON 或网络超时，系统 SHALL 跳过该发票并记录错误，不中断批处理。
- 若修复后 `amount` 仍为 0，保持原记录不变，标记 `scanStatus` 为 `failed` 以避免重复尝试。

## 性能与限制
- **并发控制**：限制同时进行的 LLM 请求数（如 3-5 个），避免触发 API 速率限制。
- **成本控制**：仅针对损坏数据调用，不处理正常发票。
