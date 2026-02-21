# 规格：Python 集成 (Delta)

## 简介
对现有的 `PythonService` 进行扩展，新增对 DeepSeek LLM API 调用的封装函数，并支持更大的上下文窗口处理PDF。

## 更新内容

### 新增 `callDeepSeek` 方法
- **功能**：封装 DeepSeek 聊天补全 API 调用（`v1/chat/completions`）。
- **参数**：
  - `prompt`: 系统和用户提示词。
  - `model`: 模型名称 (`deepseek-chat` 或 `deepseek-reasoner`，需可配置)。
  - `max_tokens`: 最大输出长度。
  - `temperature`: 创造性（0.1 用于修复，0.7 用于匹配）。
- **重试机制**：针对 `429 Too Many Requests` 实现指数退避重试。
- **超时设置**：默认 30秒请求超时。

### 新增 `PythonService.repairInvoice` 方法
- **功能**：专用于 AI 修复 PDF。
- **输入**：`filePath: string` (PDF 路径)。
- **逻辑**：
  1. 调用 `invoice_parser.py` (新增模式 `extract_text_for_llm`) 获取纯文本 (前 3000 字符)。
  2. 调用 `callDeepSeek` 发送修复 Prompts。
  3. 解析 JSON 响应。
  4. 返回 `{ success, amount, sellerName ... }`。

### 新增 `PythonService.semanticMatch` 方法
- **功能**：专用于 AI 语义匹配。
- **输入**：`transactionContext: string`, `candidates: InvoiceInfo[]`.
- **逻辑**：
  1. 构造 Prompt 包含 Context 和 Candidates。
  2. 调用 `callDeepSeek`。
  3. 解析 JSON 响应。
  4. 返回 `{ matchIndex, confidence, reason }`。

## 配置管理 (`electron-store`)
- 新增 `aiConfig` 对象：
  - `apiKey`: string (用户需手动输入 DeepSeek API Key)
  - `endpoint`: string (默认 `https://api.deepseek.com`)
  - `model`: string (默认 `deepseek-chat`)
  - `enabled`: boolean (默认 `false`)
- 在 Service 初始化时需检查 `apiKey` 是否有效。
