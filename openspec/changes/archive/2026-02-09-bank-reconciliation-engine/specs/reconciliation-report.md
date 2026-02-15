# 核销报告生成能力规格

## 概述

核销完成后，生成三种标准格式的 Excel 报告文件，供财务人员归档和后续处理。

---

## 报告类型

### 1. 自动入账凭证源

**文件名**：`自动入账凭证源_YYYYMMDD_HHMMSS.xlsx`

**适用范围**：完美匹配的数据

**列定义**：

| 列名 | 说明 | 示例 |
|------|------|------|
| 序号 | 自增序号 | 1 |
| 银行流水号 | 银行交易流水号 | TXN20240115001 |
| 交易日期 | 银行交易日期 | 2024-01-15 |
| 户名 | 对方户名 | 蚂蚁科技有限公司 |
| 交易金额 | 银行交易金额 | 5,000.00 |
| 发票代码 | 发票代码 | 044001 |
| 发票号码 | 发票号码 | 12345678 |
| 开票日期 | 发票开票日期 | 2024-01-10 |
| 价税合计 | 发票金额 | 5,000.00 |
| 匹配类型 | 匹配方式 | 完美匹配 |

### 2. 可解释性报告

**文件名**：`可解释性报告_YYYYMMDD_HHMMSS.xlsx`

**适用范围**：容差匹配 + 代付匹配（含 AI 判定）

**列定义**：

| 列名 | 说明 | 示例 |
|------|------|------|
| 序号 | 自增序号 | 1 |
| 银行流水号 | 银行交易流水号 | TXN20240115002 |
| 交易日期 | 银行交易日期 | 2024-01-15 |
| 银行户名 | 银行对方户名 | 张三 |
| 银行金额 | 银行交易金额 | 4,985.00 |
| 发票户名 | 发票销售方名称 | 蚂蚁科技有限公司 |
| 发票金额 | 发票价税合计 | 5,000.00 |
| 金额差异 | 发票金额 - 银行金额 | 15.00 |
| 匹配类型 | 匹配方式 | 手续费差异 / 代付 |
| 判定原因 | 匹配原因说明 | 跨行转账手续费 15 元 |
| 置信度 | AI 置信度（代付时显示） | 95% |
| 是否需确认 | 是否需人工确认 | 否 |

### 3. 异常情况处理报告

**文件名**：`异常情况处理报告_YYYYMMDD_HHMMSS.xlsx`

**适用范围**：未匹配数据

**Sheet 1: 有水无票**

| 列名 | 说明 |
|------|------|
| 序号 | 自增序号 |
| 银行流水号 | 银行交易流水号 |
| 交易日期 | 交易日期 |
| 户名 | 对方户名 |
| 金额 | 交易金额 |
| 备注 | 银行备注 |
| 异常原因 | 未找到对应发票 |

**Sheet 2: 有票无水**

| 列名 | 说明 |
|------|------|
| 序号 | 自增序号 |
| 发票代码 | 发票代码 |
| 发票号码 | 发票号码 |
| 销售方 | 销售方名称 |
| 金额 | 价税合计 |
| 开票日期 | 开票日期 |
| 异常原因 | 未找到对应银行流水 |

**Sheet 3: 金额严重不符**

| 列名 | 说明 |
|------|------|
| 序号 | 自增序号 |
| 银行户名 | 银行对方户名 |
| 银行金额 | 银行交易金额 |
| 发票户名 | 发票销售方 |
| 发票金额 | 发票价税合计 |
| 金额差异 | 差异金额 |
| 异常原因 | 金额差异超过容差范围 |

---

## Excel 生成

### 使用 xlsx 库

```typescript
import * as XLSX from 'xlsx'

async function generateReport(
  batchId: string, 
  type: 'voucher' | 'explanation' | 'exception'
): Promise<string> {
  const data = await getReportData(batchId, type)
  
  const workbook = XLSX.utils.book_new()
  
  if (type === 'exception') {
    // 异常报告有多个 Sheet
    const { noInvoice, noBank, amountMismatch } = data
    
    const sheet1 = XLSX.utils.json_to_sheet(noInvoice)
    XLSX.utils.book_append_sheet(workbook, sheet1, '有水无票')
    
    const sheet2 = XLSX.utils.json_to_sheet(noBank)
    XLSX.utils.book_append_sheet(workbook, sheet2, '有票无水')
    
    const sheet3 = XLSX.utils.json_to_sheet(amountMismatch)
    XLSX.utils.book_append_sheet(workbook, sheet3, '金额不符')
  } else {
    const sheet = XLSX.utils.json_to_sheet(data)
    XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1')
  }
  
  // 设置列宽
  applyColumnWidths(workbook)
  
  // 生成文件
  const fileName = generateFileName(type)
  const filePath = await saveToExports(workbook, fileName)
  
  return filePath
}
```

### 格式化

```typescript
function applyColumnWidths(workbook: XLSX.WorkBook) {
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName]
    const cols = [
      { wch: 6 },   // 序号
      { wch: 18 },  // 流水号
      { wch: 12 },  // 日期
      { wch: 25 },  // 户名
      { wch: 12 },  // 金额
      { wch: 12 },  // 发票代码
      { wch: 12 },  // 发票号码
      { wch: 30 },  // 原因
    ]
    sheet['!cols'] = cols
  })
}
```

---

## IPC 接口

### 生成报告

```typescript
// 通道: 'report:generate'
interface GenerateReportParams {
  batchId: string
  types: ('voucher' | 'explanation' | 'exception')[]
}

interface GenerateReportResult {
  success: boolean
  files: Array<{
    type: string
    path: string
    recordCount: number
  }>
  error?: string
}
```

### 导出到指定位置

```typescript
// 通道: 'report:export'
interface ExportReportParams {
  sourcePath: string
  targetDir: string
}

interface ExportReportResult {
  success: boolean
  targetPath?: string
  error?: string
}
```

---

## 报告预览

### 前端预览数据

```typescript
interface ReportPreview {
  voucher: {
    count: number
    totalAmount: number
    sample: VoucherRow[]  // 前 10 条
  }
  explanation: {
    count: number
    toleranceCount: number
    proxyCount: number
    sample: ExplanationRow[]
  }
  exception: {
    noInvoiceCount: number
    noBankCount: number
    amountMismatchCount: number
    sample: {
      noInvoice: ExceptionRow[]
      noBank: ExceptionRow[]
      amountMismatch: ExceptionRow[]
    }
  }
}
```

### 获取预览

```typescript
// 通道: 'report:preview'
interface GetReportPreviewParams {
  batchId: string
}

interface GetReportPreviewResult {
  success: boolean
  preview?: ReportPreview
  error?: string
}
```
