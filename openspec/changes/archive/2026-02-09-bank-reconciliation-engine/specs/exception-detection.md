# 异常检测能力规格

## 概述

异常检测负责识别核销过程中的各类异常情况，包括有水无票、重复支付、金额严重不符等。

---

## 异常类型

### 1. 有水无票 (NO_INVOICE)

**定义**：银行流水存在，但找不到对应的发票

**检测条件**：
- 银行流水状态为 `pending`
- 所有匹配规则均未命中
- AI 判断也无法匹配

**风险等级**：中

**建议操作**：检查发票是否遗漏导入，或联系供应商开具发票

### 2. 有票无水 (NO_BANK_TXN)

**定义**：发票存在，但找不到对应的银行流水

**检测条件**：
- 发票状态为 `pending`
- 核销完成后仍未被匹配

**风险等级**：低

**建议操作**：可能是预付款或尚未付款，检查付款计划

### 3. 重复支付 (DUPLICATE_PAYMENT)

**定义**：同一户名、同一金额出现多笔银行流水，但发票数量不足

**检测条件**：
```sql
SELECT payer_name, amount, COUNT(*) as cnt
FROM bank_transactions
WHERE batch_id = ? AND status = 'matched'
GROUP BY payer_name, amount
HAVING cnt > 1
```

然后检查对应发票数量是否匹配

**风险等级**：高

**建议操作**：核实是否存在重复付款，联系银行或供应商

### 4. 金额严重不符 (AMOUNT_MISMATCH)

**定义**：户名一致，但金额差异超过容差范围（>20 元）

**检测条件**：
- `normalize(bankName) === normalize(invoiceName)`
- `abs(bankAmount - invoiceAmount) > 20`

**风险等级**：中

**建议操作**：检查是否存在拆分付款或合并开票

### 5. 可疑代付 (SUSPICIOUS_PROXY)

**定义**：AI 判断为代付关系，但置信度较低

**检测条件**：
- AI 返回 `canMatch: true`
- 置信度 < 0.8

**风险等级**：中

**建议操作**：人工确认代付关系是否成立

---

## 检测算法

### 主流程

```typescript
async function runExceptionDetection(batchId: string): Promise<ExceptionReport> {
  const results: Exception[] = []
  
  // 1. 有水无票
  const noInvoice = await detectNoInvoice(batchId)
  results.push(...noInvoice.map(item => ({
    type: 'NO_INVOICE',
    severity: 'medium',
    relatedId: item.id,
    detail: item,
    suggestion: '检查发票是否遗漏导入'
  })))
  
  // 2. 有票无水
  const noBank = await detectNoBank(batchId)
  results.push(...noBank.map(item => ({
    type: 'NO_BANK_TXN',
    severity: 'low',
    relatedId: item.id,
    detail: item,
    suggestion: '可能是预付款或尚未付款'
  })))
  
  // 3. 重复支付
  const duplicates = await detectDuplicatePayment(batchId)
  results.push(...duplicates.map(item => ({
    type: 'DUPLICATE_PAYMENT',
    severity: 'high',
    relatedId: item.ids.join(','),
    detail: item,
    suggestion: '请核实是否存在重复付款'
  })))
  
  // 4. 金额严重不符
  const amountIssues = await detectAmountMismatch(batchId)
  results.push(...amountIssues.map(item => ({
    type: 'AMOUNT_MISMATCH',
    severity: 'medium',
    relatedId: `${item.bankId}:${item.invoiceId}`,
    detail: item,
    suggestion: '检查是否存在拆分付款'
  })))
  
  // 5. 可疑代付
  const suspicious = await detectSuspiciousProxy(batchId)
  results.push(...suspicious.map(item => ({
    type: 'SUSPICIOUS_PROXY',
    severity: 'medium',
    relatedId: item.matchId,
    detail: item,
    suggestion: '请人工确认代付关系'
  })))
  
  // 统计汇总
  return {
    total: results.length,
    highSeverity: results.filter(r => r.severity === 'high').length,
    mediumSeverity: results.filter(r => r.severity === 'medium').length,
    lowSeverity: results.filter(r => r.severity === 'low').length,
    exceptions: results
  }
}
```

### 具体检测函数

```typescript
// 有水无票检测
async function detectNoInvoice(batchId: string) {
  return db.select()
    .from(bankTransactions)
    .where(and(
      eq(bankTransactions.batchId, batchId),
      eq(bankTransactions.status, 'pending')
    ))
}

// 重复支付检测
async function detectDuplicatePayment(batchId: string) {
  const grouped = await db.select({
    payerName: bankTransactions.payerName,
    amount: bankTransactions.amount,
    count: sql<number>`count(*)`,
    ids: sql<string>`group_concat(id)`
  })
  .from(bankTransactions)
  .where(and(
    eq(bankTransactions.batchId, batchId),
    eq(bankTransactions.status, 'matched')
  ))
  .groupBy(bankTransactions.payerName, bankTransactions.amount)
  .having(sql`count(*) > 1`)
  
  // 检查对应发票数量
  const duplicates = []
  for (const group of grouped) {
    const invoiceCount = await countMatchedInvoices(batchId, group.payerName, group.amount)
    if (group.count > invoiceCount) {
      duplicates.push({
        payerName: group.payerName,
        amount: group.amount,
        bankCount: group.count,
        invoiceCount,
        ids: group.ids.split(',')
      })
    }
  }
  
  return duplicates
}
```

---

## 异常严重程度

| 级别 | 颜色 | 处理优先级 | 说明 |
|------|------|-----------|------|
| high | 红色 | 立即处理 | 可能存在财务风险 |
| medium | 橙色 | 需关注 | 需要人工确认 |
| low | 黄色 | 可延后 | 正常业务情况 |

---

## IPC 接口

### 执行异常检测

```typescript
// 通道: 'exception:detect'
interface DetectExceptionsParams {
  batchId: string
}

interface DetectExceptionsResult {
  success: boolean
  total: number
  highSeverity: number
  mediumSeverity: number
  lowSeverity: number
  exceptions: Exception[]
}
```

### 获取异常详情

```typescript
// 通道: 'exception:get-detail'
interface GetExceptionDetailParams {
  exceptionId: string
}

interface GetExceptionDetailResult {
  success: boolean
  exception?: {
    type: string
    severity: string
    detail: any
    suggestion: string
    relatedBankTxns: BankTransaction[]
    relatedInvoices: Invoice[]
  }
}
```

### 标记异常已处理

```typescript
// 通道: 'exception:resolve'
interface ResolveExceptionParams {
  exceptionId: string
  resolution: 'ignore' | 'manual_match' | 'confirmed_issue'
  note?: string
}

interface ResolveExceptionResult {
  success: boolean
}
```

---

## 异常处理建议

### 自动建议

根据异常类型提供智能建议：

```typescript
function getSuggestion(exception: Exception): string {
  switch (exception.type) {
    case 'NO_INVOICE':
      return `未找到金额为 ${exception.detail.amount} 的发票，` +
             `建议检查发票是否导入，或联系 "${exception.detail.payerName}" 开具发票`
    
    case 'DUPLICATE_PAYMENT':
      return `向 "${exception.detail.payerName}" 支付了 ${exception.detail.bankCount} 次 ` +
             `${exception.detail.amount} 元，但只有 ${exception.detail.invoiceCount} 张对应发票，` +
             `可能存在重复付款`
    
    // ... 其他类型
  }
}
```
