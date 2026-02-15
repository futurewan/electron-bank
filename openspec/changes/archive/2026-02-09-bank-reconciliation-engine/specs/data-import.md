# 数据导入能力规格

## 概述

数据导入能力负责解析银行流水、发票和付款人对应表文件，进行数据清洗后存入数据库。

---

## 支持的文件格式

### 银行流水
| 格式 | 扩展名 | 解析方式 |
|------|--------|----------|
| Excel | .xlsx, .xls | xlsx 库 |
| CSV | .csv | csv-parser 库 |

### 发票数据
| 格式 | 扩展名 | 解析方式 |
|------|--------|----------|
| Excel | .xlsx, .xls | xlsx 库（优先推荐） |
| 电子 PDF | .pdf | AI 文本提取 |

### 付款人对应表
| 格式 | 扩展名 | 解析方式 |
|------|--------|----------|
| Excel | .xlsx, .xls | xlsx 库 |

---

## 数据字段映射

### 银行流水字段

| 目标字段 | 必填 | 类型 | 可能的列名 |
|---------|------|------|-----------|
| transactionDate | ✓ | Date | 交易日期, 日期, 记账日期, Date |
| payerName | ✓ | String | 对方户名, 交易对手, 付款人, 收款人 |
| payerAccount | | String | 对方账号, 账号 |
| amount | ✓ | Number | 交易金额, 金额, 发生额 |
| remark | | String | 备注, 摘要, 附言 |

### 发票字段

| 目标字段 | 必填 | 类型 | 可能的列名 |
|---------|------|------|-----------|
| invoiceCode | | String | 发票代码 |
| invoiceNumber | | String | 发票号码 |
| sellerName | ✓ | String | 销售方名称, 销方名称, 开票单位 |
| amount | ✓ | Number | 价税合计, 金额, 合计金额 |
| invoiceDate | | Date | 开票日期, 日期 |

### 付款人对应表字段

| 目标字段 | 必填 | 类型 | 可能的列名 |
|---------|------|------|-----------|
| personName | ✓ | String | 姓名, 付款人, 个人 |
| companyName | ✓ | String | 公司, 对应公司, 企业名称 |
| accountSuffix | | String | 账号尾号, 卡尾号 |
| remark | | String | 备注, 说明 |

---

## 数据清洗规则

### 户名规范化

```typescript
function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/\s+/g, '')
    // 可选：移除常见后缀
    // .replace(/有限公司$/, '')
    // .replace(/\(中国\)/, '')
}
```

### 金额规范化

```typescript
function normalizeAmount(value: any): number {
  if (typeof value === 'number') return Math.abs(value)
  if (typeof value === 'string') {
    // 移除货币符号和千分位
    const cleaned = value.replace(/[¥$,，]/g, '').trim()
    return Math.abs(parseFloat(cleaned))
  }
  return 0
}
```

### 日期规范化

```typescript
function normalizeDate(value: any): Date | null {
  if (value instanceof Date) return value
  if (typeof value === 'number') {
    // Excel 日期序列号
    return excelDateToJSDate(value)
  }
  if (typeof value === 'string') {
    // 尝试多种格式：2024-01-15, 2024/01/15, 20240115
    return parseFlexibleDate(value)
  }
  return null
}
```

---

## PDF 发票解析

### AI 提取 Prompt

```
请从以下电子发票 PDF 文本中提取结构化信息。

PDF 文本内容：
"""
{pdfText}
"""

请提取以下字段（如果存在）：
1. 发票代码
2. 发票号码
3. 开票日期
4. 销售方名称
5. 价税合计

返回 JSON 格式：
{
  "invoiceCode": "...",
  "invoiceNumber": "...",
  "invoiceDate": "YYYY-MM-DD",
  "sellerName": "...",
  "amount": 数字
}

如果某字段无法识别，返回 null。
```

### 解析失败处理

1. PDF 文本提取失败 → 标记为"无法解析"，提示用户使用 Excel
2. AI 返回格式错误 → 重试一次，仍失败则标记异常
3. 关键字段缺失 → 标记为"信息不完整"，列出缺失字段

---

## IPC 接口

### 导入银行流水

```typescript
// 通道: 'import:bank-transactions'
interface ImportBankTransactionsParams {
  batchId: string
  filePath: string
}

interface ImportBankTransactionsResult {
  success: boolean
  count: number
  errors?: Array<{
    row: number
    message: string
  }>
}
```

### 导入发票

```typescript
// 通道: 'import:invoices'
interface ImportInvoicesParams {
  batchId: string
  filePaths: string[]  // 支持多个文件
  fileType: 'excel' | 'pdf'
}

interface ImportInvoicesResult {
  success: boolean
  count: number
  pdfParseResults?: Array<{
    fileName: string
    success: boolean
    data?: InvoiceData
    error?: string
  }>
}
```

### 导入付款人对应表

```typescript
// 通道: 'import:payer-mappings'
interface ImportPayerMappingsParams {
  filePath: string
}

interface ImportPayerMappingsResult {
  success: boolean
  count: number
  errors?: Array<{
    row: number
    message: string
  }>
}
```

---

## 验证规则

### 导入前验证

1. 文件存在且可读
2. 文件格式支持
3. 文件大小 < 50MB

### 导入后验证

1. 必填字段不为空
2. 金额 > 0
3. 日期格式合法
4. 无严重数据异常（如全部金额为 0）

### 错误处理

- 单行错误：记录错误，跳过该行，继续处理
- 致命错误（如文件损坏）：终止导入，返回错误信息
