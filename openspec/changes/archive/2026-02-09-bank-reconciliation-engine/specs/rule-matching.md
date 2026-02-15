# 规则匹配引擎规格

## 概述

规则匹配引擎负责使用本地规则对银行流水和发票数据进行匹配，是核销的第一道防线，目标是零 Token 成本处理 85%+ 的数据。

---

## 匹配级别

### Level 1: 完美匹配 (Perfect Match)

**条件**：
- 金额完全相等：`bankAmount === invoiceAmount`
- 户名完全相等：`normalize(bankName) === normalize(invoiceName)`

**结果**：
- match_type: `perfect`
- reason: `金额与户名完全一致`
- confidence: `1.0`

### Level 2: 容差匹配 (Tolerance Match)

**条件**：
- 户名完全相等：`normalize(bankName) === normalize(invoiceName)`
- 金额接近：`0 < (invoiceAmount - bankAmount) <= 20`

**结果**：
- match_type: `tolerance`
- reason: `手续费差异 {diff} 元（银行转账手续费）`
- confidence: `0.95`
- amount_diff: `invoiceAmount - bankAmount`

**注意**：只匹配发票金额 > 银行金额的情况（手续费被扣减）

### Level 3: 关系映射匹配 (Proxy Match)

**条件**：
- 金额相等（或容差范围内）
- 户名不相等
- 付款人对应表中存在映射关系

**查询逻辑**：
```typescript
// 检查银行户名是否映射到发票户名
const mapping = await db.query(payerMappings)
  .where(and(
    eq(payerMappings.personName, bankName),
    eq(payerMappings.companyName, invoiceName)
  ))
  .first()

if (mapping) {
  // 可选：验证账号尾号
  if (mapping.accountSuffix && bankAccountSuffix) {
    return bankAccountSuffix.endsWith(mapping.accountSuffix)
  }
  return true
}
```

**结果**：
- match_type: `proxy`
- reason: `代付关系：{personName} 代表 {companyName} 付款（来源：对应表）`
- confidence: `0.90`

---

## 匹配算法

### 主流程

```typescript
async function executeRuleMatching(batchId: string): Promise<MatchingResult> {
  const bankTxs = await getBankTransactions(batchId, 'pending')
  const invoices = await getInvoices(batchId, 'pending')
  
  const results: MatchResult[] = []
  const matchedBankIds = new Set<string>()
  const matchedInvoiceIds = new Set<string>()
  
  // Level 1: 完美匹配
  for (const bank of bankTxs) {
    if (matchedBankIds.has(bank.id)) continue
    
    const match = invoices.find(inv => 
      !matchedInvoiceIds.has(inv.id) &&
      bank.amount === inv.amount &&
      normalize(bank.payerName) === normalize(inv.sellerName)
    )
    
    if (match) {
      results.push(createMatchResult(bank, match, 'perfect'))
      matchedBankIds.add(bank.id)
      matchedInvoiceIds.add(match.id)
    }
  }
  
  // Level 2: 容差匹配
  for (const bank of bankTxs) {
    if (matchedBankIds.has(bank.id)) continue
    
    const match = invoices.find(inv => 
      !matchedInvoiceIds.has(inv.id) &&
      normalize(bank.payerName) === normalize(inv.sellerName) &&
      inv.amount > bank.amount &&
      (inv.amount - bank.amount) <= 20
    )
    
    if (match) {
      results.push(createMatchResult(bank, match, 'tolerance', inv.amount - bank.amount))
      matchedBankIds.add(bank.id)
      matchedInvoiceIds.add(match.id)
    }
  }
  
  // Level 3: 关系映射匹配
  const mappings = await getPayerMappings()
  for (const bank of bankTxs) {
    if (matchedBankIds.has(bank.id)) continue
    
    // 查找该银行户名对应的公司列表
    const relatedCompanies = mappings
      .filter(m => m.personName === normalize(bank.payerName))
      .map(m => m.companyName)
    
    if (relatedCompanies.length === 0) continue
    
    const match = invoices.find(inv =>
      !matchedInvoiceIds.has(inv.id) &&
      relatedCompanies.includes(normalize(inv.sellerName)) &&
      (bank.amount === inv.amount || (inv.amount - bank.amount > 0 && inv.amount - bank.amount <= 20))
    )
    
    if (match) {
      results.push(createMatchResult(bank, match, 'proxy'))
      matchedBankIds.add(bank.id)
      matchedInvoiceIds.add(match.id)
    }
  }
  
  // 保存结果
  await saveMatchResults(results)
  
  return {
    perfectCount: results.filter(r => r.matchType === 'perfect').length,
    toleranceCount: results.filter(r => r.matchType === 'tolerance').length,
    proxyCount: results.filter(r => r.matchType === 'proxy').length,
    remainingBankCount: bankTxs.length - matchedBankIds.size,
    remainingInvoiceCount: invoices.length - matchedInvoiceIds.size,
  }
}
```

### 户名规范化

```typescript
function normalize(name: string): string {
  if (!name) return ''
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[·•]/g, '')  // 移除人名中间的点
}
```

---

## 性能优化

### 索引策略

```sql
-- 银行流水索引
CREATE INDEX idx_bank_batch_status ON bank_transactions(batch_id, status);
CREATE INDEX idx_bank_amount ON bank_transactions(amount);
CREATE INDEX idx_bank_payer_name ON bank_transactions(payer_name);

-- 发票索引
CREATE INDEX idx_invoice_batch_status ON invoices(batch_id, status);
CREATE INDEX idx_invoice_amount ON invoices(amount);
CREATE INDEX idx_invoice_seller_name ON invoices(seller_name);

-- 对应关系索引
CREATE INDEX idx_mapping_person ON payer_mappings(person_name);
```

### 分批处理

对于大数据量（>1000 条），分批处理：

```typescript
const BATCH_SIZE = 500

async function executeRuleMatchingBatched(batchId: string) {
  const totalBank = await countBankTransactions(batchId)
  let offset = 0
  
  while (offset < totalBank) {
    const bankBatch = await getBankTransactions(batchId, 'pending', BATCH_SIZE, offset)
    await processMatchingBatch(bankBatch)
    offset += BATCH_SIZE
    
    // 发送进度更新
    sendProgress({ current: offset, total: totalBank })
  }
}
```

---

## IPC 接口

### 执行规则匹配

```typescript
// 通道: 'matching:execute-rules'
interface ExecuteRuleMatchingParams {
  batchId: string
}

interface ExecuteRuleMatchingResult {
  success: boolean
  perfectCount: number
  toleranceCount: number
  proxyCount: number
  remainingBankCount: number
  remainingInvoiceCount: number
  duration: number  // 毫秒
}
```

### 获取匹配进度

```typescript
// 通道: 'matching:progress'（事件推送）
interface MatchingProgressEvent {
  batchId: string
  level: 1 | 2 | 3
  current: number
  total: number
  matchedCount: number
}
```

---

## 边界情况处理

### 一对多匹配

同一银行流水匹配多张发票：
- 当前版本：只匹配第一张
- 标记其他发票为"可能重复"

### 多对一匹配

多笔银行流水对应同一张大额发票：
- 当前版本：不支持
- 标记为"待人工拆分"

### 完全相同数据

多条银行流水金额户名完全相同：
- 按导入顺序匹配
- 使用交易流水号辅助区分
