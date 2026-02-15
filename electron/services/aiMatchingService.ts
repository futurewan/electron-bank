
/**
 * AI 语义匹配服务
 * 利用 LLM 智能分析未匹配的账单
 */
import { and, eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/client'
import {
    bankTransactions,
    invoices,
    matchResults,
    NewMatchResult,
} from '../database/schema'
import { aiService } from './aiService'
import { MatchingStats } from './matchingService'

/**
 * AI 匹配进度回调
 */
export type AIMatchingProgressCallback = (progress: {
  current: number
  total: number
  matchedCount: number
  message: string
}) => void

/**
 * 执行 AI 语义匹配
 */
export async function executeAIMatching(
  batchId: string,
  onProgress?: AIMatchingProgressCallback
): Promise<MatchingStats> {
  const db = getDatabase()
  
  // 1. 获取未匹配的记录
  const unmatchedBank = await db.select().from(bankTransactions)
    .where(and(
      eq(bankTransactions.batchId, batchId),
      eq(bankTransactions.status, 'pending')
    ))
  
  const unmatchedInvoices = await db.select().from(invoices)
    .where(and(
      eq(invoices.batchId, batchId),
      eq(invoices.status, 'pending')
    ))
  
  console.log(`[AI Match] 开始 AI 匹配: 银行流水 ${unmatchedBank.length} 条, 发票 ${unmatchedInvoices.length} 条`)
  
  let aiCount = 0
  let processedCount = 0
  const total = unmatchedBank.length
  
  // 2. 逐条分析（或分批）
  // 为了节省 Token，我们先进行粗筛：只对金额相近（±10%）或日期相近（±7天）的记录进行 AI 判断
  
  for (const bankTx of unmatchedBank) {
    processedCount++
    if (processedCount % 5 === 0) {
      onProgress?.({
        current: processedCount,
        total: total,
        matchedCount: aiCount,
        message: `正在进行 AI 分析 ${processedCount}/${total}...`
      })
    }

    // 筛选候选发票：金额差异在 10% 以内
    const candidates = unmatchedInvoices.filter(inv => {
      // 必须是待处理状态（可能被本轮循环的前面步骤匹配了，这里简单起见假设单线程顺序执行，
      // 但实际上我们需要标记已使用的发票）
      if (inv.status !== 'pending') return false
      
      const ratio = Math.abs(inv.amount - bankTx.amount) / bankTx.amount
      return ratio < 0.1 // 10% 差异以内
    })
    
    if (candidates.length === 0) {
      continue
    }
    
    // 如果候选太多（>5），取金额最接近的前 5 个，避免 Token 消耗过大
    candidates.sort((a, b) => Math.abs(a.amount - bankTx.amount) - Math.abs(b.amount - bankTx.amount))
    const topCandidates = candidates.slice(0, 5)
    
    // 3. 构建 Prompt
    const prompt = `请分析以下银行流水与候选发票是否匹配。
匹配规则：
1. 金额相近（可能存在手续费或税差）。
2. 户名可能不一致但存在代付关系（如备注中提到）。
3. 日期相近（通常发票早于或等于流水日期，但也可能晚几天）。

银行流水：
- ID: ${bankTx.id}
- 日期: ${bankTx.transactionDate}
- 户名: ${bankTx.payerName}
- 金额: ${bankTx.amount}
- 备注: ${bankTx.remark}

候选发票列表：
${topCandidates.map((inv, idx) => `
[候选 ${idx + 1}]
- ID: ${inv.id}
- 日期: ${inv.invoiceDate}
- 销方: ${inv.sellerName}
- 金额: ${inv.amount}
`).join('\n')}

请判断哪个候选发票是最佳匹配。如果是，返回 JSON 格式：
{
  "matched": true,
  "candidateIndex": 1, // 候选列表索引，从 1 开始
  "confidence": 0.9,   // 置信度 0-1
  "reason": "备注中明确提到代付关系"
}
如果都不匹配，返回：
{
  "matched": false,
  "reason": "金额差异过大且无关联信息"
}
只返回 JSON，不要其他废话。`

    try {
      // 4. 调用 AI
      const result = await aiService.chat([
        { role: 'system', content: '你是一个专业的财务对账专家。' },
        { role: 'user', content: prompt }
      ])
      
      // 解析结果
      const content = result.result.trim()
      // 尝试提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0])
        
        if (analysis.matched && analysis.candidateIndex > 0 && analysis.candidateIndex <= topCandidates.length) {
          const matchedInvoice = topCandidates[analysis.candidateIndex - 1]
          
          // 只有置信度较高才采纳
          if (analysis.confidence > 0.7) {
            // 保存匹配结果
            const matchId = uuidv4()
            const matchRecord: NewMatchResult = {
              id: matchId,
              batchId,
              bankId: bankTx.id,
              invoiceId: matchedInvoice.id,
              matchType: 'ai',
              confidence: analysis.confidence,
              reason: analysis.reason,
              amountDiff: parseFloat((bankTx.amount - matchedInvoice.amount).toFixed(2)),
              needsConfirmation: true, // AI 匹配默认为 true，需要确认
              confirmed: false,
              createdAt: new Date(),
            }
            
            await db.insert(matchResults).values(matchRecord)
            
            // 更新状态
            await db.update(bankTransactions)
              .set({ status: 'matched' })
              .where(eq(bankTransactions.id, bankTx.id))
              
            await db.update(invoices)
              .set({ status: 'matched' })
              .where(eq(invoices.id, matchedInvoice.id))
              
            // 从当前未匹配列表中移除（标记状态已改）
            matchedInvoice.status = 'matched'
            aiCount++
          }
        }
      }
    } catch (error) {
      console.error(`[AI Match] Error for tx ${bankTx.id}:`, error)
      // 继续处理下一条
    }
  }
  
  // 5. 返回统计
  // 重新查询剩余数量
  const remainingBank = await db.select().from(bankTransactions)
    .where(and(eq(bankTransactions.batchId, batchId), eq(bankTransactions.status, 'pending')))
  
  const remainingInvoice = await db.select().from(invoices)
    .where(and(eq(invoices.batchId, batchId), eq(invoices.status, 'pending')))
    
  // 获取已存在的统计并加上新增的
  // 简单起见，这里只返回 delta 统计或重新计算所有
  // 我们返回当前的快照
  
  // 实际上这里应该返回本次操作的影响，或者调用者重新计算
  // 我们手动构造一下
  
  return {
    perfectCount: 0, // 已经在 Rule 阶段统计
    toleranceCount: 0,
    proxyCount: 0,
    aiCount,
    remainingBankCount: remainingBank.length,
    remainingInvoiceCount: remainingInvoice.length,
    duration: 0
  }
}
