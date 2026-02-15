# AI 语义匹配能力规格

## 概述

AI 语义匹配用于处理本地规则无法匹配的剩余数据（约 10-15%），通过批量调用 LLM 进行语义分析，判断是否存在代付等特殊关系。

---

## 触发条件

### 何时调用 AI

1. 本地三级规则匹配均未命中
2. 满足以下条件之一：
   - 金额相等，户名不同
   - 金额差 ≤20 元，户名不同
3. 存在备注信息可供参考

### 何时不调用 AI

1. 金额差异 > 20 元 → 直接标记异常
2. 没有任何备注/参考信息 → 无法做语义判断
3. API Key 未配置 → 标记"待配置 AI"

---

## 批量处理策略

### 批次大小

```typescript
const AI_BATCH_SIZE = 50  // 每次最多处理 50 条
const MAX_TOKENS_PER_BATCH = 4000  // 控制输入 token
```

### 批量 Prompt 模板

```
你是专业的财务核对助手。请分析以下待匹配数据，判断每条银行流水是否可以与对应发票匹配。

背景知识：
1. 代付：个人代表公司付款，如"张三"代表"ABC公司"付款
2. 关联关系：人名可能是公司的员工、股东、法人代表
3. 你需要根据备注信息判断是否存在合理的代付关系

待匹配数据：
[
  {
    "id": "txn_001",
    "银行户名": "张三",
    "银行金额": 5000.00,
    "发票户名": "蚂蚁科技有限公司",
    "发票金额": 5000.00,
    "备注": "张三是蚂蚁公司采购负责人"
  },
  {
    "id": "txn_002",
    "银行户名": "李四",
    "银行金额": 3200.00,
    "发票户名": "字节跳动",
    "发票金额": 3200.00,
    "备注": ""
  }
]

请按以下 JSON 格式返回判断结果：
[
  {
    "id": "txn_001",
    "canMatch": true,
    "matchType": "proxy",
    "reason": "根据备注，张三是蚂蚁公司采购负责人，属于代付关系",
    "confidence": 0.95
  },
  {
    "id": "txn_002",
    "canMatch": false,
    "matchType": null,
    "reason": "无备注信息，无法判断李四与字节跳动的关系",
    "confidence": 0
  }
]

要求：
1. confidence 范围 0-1，0.8 以上为高置信度
2. 如无法判断，canMatch 设为 false
3. reason 需简洁说明判断依据
```

---

## 备注表预处理

### 关系提取

对付款人对应表和备注信息进行 AI 预处理，提取结构化关系：

```typescript
async function extractRelationships(remarks: string[]): Promise<Relationship[]> {
  const prompt = `
请从以下备注信息中提取人员与公司的对应关系。

备注列表：
${remarks.map((r, i) => `${i + 1}. ${r}`).join('\n')}

返回 JSON 格式：
[
  { "person": "张三", "company": "蚂蚁公司", "relation": "采购经理" },
  { "person": "李四", "company": "字节跳动", "relation": "法人代表" }
]

只提取明确的人员-公司对应关系，不要推测。
`

  const result = await aiService.analyze(remarks, prompt)
  return JSON.parse(result.result)
}
```

### 关系入库

提取的关系存入 `payer_mappings` 表：

```typescript
interface ExtractedRelationship {
  person: string
  company: string
  relation: string
}

async function saveExtractedRelationships(relationships: ExtractedRelationship[]) {
  const mappings = relationships.map(r => ({
    id: generateId(),
    personName: r.person,
    companyName: r.company,
    remark: r.relation,
    source: 'ai_extracted',
    createdAt: new Date()
  }))
  
  await db.insert(payerMappings).values(mappings)
}
```

---

## 置信度处理

### 置信度级别

| 级别 | 范围 | 处理方式 |
|------|------|----------|
| 高置信 | ≥ 0.8 | 自动匹配 |
| 中置信 | 0.5-0.8 | 标记"建议确认" |
| 低置信 | < 0.5 | 标记"不匹配" |

### 结果标记

```typescript
function processAIResult(result: AIMatchResult): ProcessedResult {
  if (result.canMatch && result.confidence >= 0.8) {
    return {
      status: 'matched',
      matchType: 'ai',
      reason: result.reason,
      confidence: result.confidence,
      needsConfirmation: false
    }
  }
  
  if (result.canMatch && result.confidence >= 0.5) {
    return {
      status: 'pending_confirmation',
      matchType: 'ai',
      reason: result.reason,
      confidence: result.confidence,
      needsConfirmation: true
    }
  }
  
  return {
    status: 'unmatched',
    matchType: null,
    reason: result.reason || '无法确定匹配关系',
    confidence: result.confidence,
    needsConfirmation: false
  }
}
```

---

## 错误处理

### API 错误重试

```typescript
const MAX_RETRIES = 3
const RETRY_DELAY = 1000  // 毫秒

async function callAIWithRetry(prompt: string): Promise<string> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const result = await aiService.analyze(null, prompt)
      if (result.success) {
        return result.result
      }
      throw new Error(result.error)
    } catch (error) {
      if (i === MAX_RETRIES - 1) throw error
      await sleep(RETRY_DELAY * (i + 1))
    }
  }
}
```

### JSON 解析失败

```typescript
function parseAIResponse(response: string): AIMatchResult[] {
  try {
    // 尝试直接解析
    return JSON.parse(response)
  } catch {
    // 尝试提取 JSON 块
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    throw new Error('AI 返回格式无法解析')
  }
}
```

### 降级处理

AI 服务不可用时：
1. 所有待 AI 判断的数据标记为 `pending_manual`
2. 提示用户"AI 服务暂不可用，请手动确认或稍后重试"
3. 不阻塞其他流程

---

## IPC 接口

### 执行 AI 匹配

```typescript
// 通道: 'matching:execute-ai'
interface ExecuteAIMatchingParams {
  batchId: string
}

interface ExecuteAIMatchingResult {
  success: boolean
  processedCount: number
  matchedCount: number
  pendingConfirmationCount: number
  unmatchedCount: number
  tokensUsed: number
  error?: string
}
```

### AI 匹配进度事件

```typescript
// 通道: 'matching:ai-progress'（事件推送）
interface AIMatchingProgressEvent {
  batchId: string
  currentBatch: number
  totalBatches: number
  processedCount: number
  remainingCount: number
}
```

---

## Token 优化

### 输入压缩

只发送必要字段：

```typescript
// ❌ 不要发送
const fullData = {
  id: "txn_001",
  batchId: "batch_123",
  transactionDate: "2024-01-15",
  payerName: "张三",
  payerAccount: "6222xxxx1234",
  amount: 5000.00,
  remark: "...",
  status: "pending",
  createdAt: "..."
}

// ✅ 只发送关键信息
const compactData = {
  id: "txn_001",
  银行户名: "张三",
  银行金额: 5000.00,
  发票户名: "蚂蚁公司",
  发票金额: 5000.00,
  备注: "..."
}
```

### 批量大小动态调整

根据备注长度动态调整批次大小：

```typescript
function calculateBatchSize(items: UnmatchedItem[]): number {
  const avgRemarkLength = items.reduce((sum, i) => sum + (i.remark?.length || 0), 0) / items.length
  
  if (avgRemarkLength > 200) return 20  // 长备注，减小批次
  if (avgRemarkLength > 100) return 35
  return 50  // 默认
}
```
