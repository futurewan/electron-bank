## Why

财务人员在月结/季结时，需要对银行流水与发票进行批量比对核销。当前痛点：

1. **金额微差**：跨行转账产生的手续费（通常 ≤20 元）导致金额不完全匹配
2. **人名不符**：代付场景下，银行户名（个人）与发票户名（公司）不一致
3. **人工耗时**：每月数百到数千条数据，人工核对效率低、易出错

本变更实现"本地规则优先 + AI 批量兜底"的智能核销引擎，在保证准确率的同时最大化降低 AI Token 消耗（预估节省 80%+ 成本）。

## What Changes

### 新增功能

- **数据导入模块**
  - 支持银行流水 Excel/CSV 导入
  - 支持发票 Excel 导入（优先）和电子 PDF 智能解析
  - 支持《特殊付款人对应表》Excel 导入

- **本地规则匹配引擎**
  - 完美匹配：金额相等 + 户名相等 → 自动核销
  - 容差匹配：金额差 ≤20 元 + 户名相等 → 标记"手续费差异"
  - 关系映射匹配：基于对应表的代付关系本地查表

- **AI 语义匹配模块**
  - 备注表预处理：AI 一次性提取关系映射（张三 → 蚂蚁公司）
  - 批量语义判断：对无法本地匹配的数据进行 AI 批量分析
  - 置信度打分：返回匹配置信度和推理依据

- **异常检测与报告**
  - 有水无票检测
  - 重复支付检测
  - 金额严重不符预警

- **报告生成**
  - 《自动入账凭证源.xlsx》：完美匹配项
  - 《可解释性报告.xlsx》：手续费/代付项（附 AI 推理原话）
  - 《异常情况处理报告.xlsx》：未匹配项及错误类型

### 技术架构

- 使用已建立的 SQLite + Drizzle ORM 存储核销记录
- 使用已建立的 AI 服务（OpenAI API）进行语义分析
- 前端使用 React + Zustand 进行状态管理和 UI 渲染

## Capabilities

### New Capabilities

- `data-import`: 数据导入能力，包括银行流水、发票、付款人对应表的文件解析和数据清洗
- `rule-matching`: 本地规则匹配引擎，实现完美匹配、容差匹配、关系映射匹配
- `ai-semantic-match`: AI 语义匹配能力，包括备注表预处理和批量语义判断
- `reconciliation-report`: 核销报告生成能力，输出三种标准格式报告
- `exception-detection`: 异常检测能力，识别有水无票、重复支付、金额不符等问题

### Modified Capabilities

（无现有 spec 需要修改）

## Impact

### 代码影响

- **主进程 (electron/)**
  - 新增 `services/importService.ts`：文件导入和解析
  - 新增 `services/matchingService.ts`：规则匹配引擎
  - 新增 `services/reconciliationService.ts`：核销流程编排
  - 新增 `services/reportService.ts`：报告生成
  - 扩展 `services/aiService.ts`：增加批量分析和关系提取方法

- **渲染进程 (src/)**
  - 新增 `pages/ReconciliationPage/`：核销主页面
  - 新增 `components/DataImport/`：数据导入组件
  - 新增 `components/MatchingProgress/`：匹配进度展示
  - 新增 `components/ReportPreview/`：报告预览组件
  - 新增 `stores/reconciliationStore.ts`：核销状态管理

- **数据库**
  - 扩展 `reconciliation_records` 表结构
  - 新增 `bank_transactions` 表：银行流水
  - 新增 `invoices` 表：发票数据
  - 新增 `payer_mappings` 表：付款人对应关系
  - 新增 `match_results` 表：匹配结果

### 依赖

- `xlsx`：Excel 文件解析
- `csv-parser`：CSV 文件解析
- `pdf-parse`：PDF 文本提取（备选）

### Token 成本预估

| 场景 | 数据量 | 预估 Token | 成本 (GPT-4o-mini) |
|------|--------|------------|-------------------|
| 单次核销 | 1,000 条 | 50K-100K | ¥0.3-0.6 |
| 月度 10 次 | 10,000 条 | 500K-1M | ¥3-6 |
| 月度 50 次 | 50,000 条 | 2.5M-5M | ¥15-30 |
