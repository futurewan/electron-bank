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
  payerMappings
} from '../database/schema'
import { aiService } from './aiService'
import { MatchingStats } from './matchingService'
import { repairBrokenInvoices } from './invoiceParseService'

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

  // 0. 前置步骤：尝试修复解析失败的发票（"Zombie Invoices"）
  //    用户需求：希望 PDF 未能正确识别的（通常表现为金额为0或信息缺失）给 AI 综合识别
  await repairBrokenInvoices(batchId, (current, total, message) => {
    onProgress?.({
      current,
      total,
      matchedCount: 0,
      message: `[AI Repair] ${message}`
    });
  });

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

  // 2. 逐条分析
  const DATE_TOLERANCE_DAYS = 30; // 扩大到 30 天
  const AMOUNT_TOLERANCE_PERCENT = 0.10; // 10% 容差，给 AI 更多空间分析手续费或部分支付

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

    // 筛选候选发票
    const candidates = unmatchedInvoices.filter(inv => {
      // Status check
      if (inv.status !== 'pending') return false;

      // Amount check (5%)
      const amountDiff = Math.abs(inv.amount - bankTx.amount);
      const ratio = amountDiff / bankTx.amount;
      if (ratio > AMOUNT_TOLERANCE_PERCENT) return false;

      // Date check (7 days)
      if (bankTx.transactionDate && inv.invoiceDate) {
        const diffTime = Math.abs(bankTx.transactionDate.getTime() - inv.invoiceDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > DATE_TOLERANCE_DAYS) return false;
      }

      return true;
    });

    if (candidates.length === 0) {
      continue
    }

    // Sort by amount diff, then date diff
    candidates.sort((a, b) => {
      const diffA = Math.abs(a.amount - bankTx.amount);
      const diffB = Math.abs(b.amount - bankTx.amount);
      if (Math.abs(diffA - diffB) > 0.01) return diffA - diffB;
      // If amounts very similar, check date
      const dateA = a.invoiceDate ? a.invoiceDate.getTime() : 0;
      const dateB = b.invoiceDate ? b.invoiceDate.getTime() : 0;
      const txDate = bankTx.transactionDate ? bankTx.transactionDate.getTime() : 0;
      return Math.abs(dateA - txDate) - Math.abs(dateB - txDate);
    });

    // Top 5 candidates
    const topCandidates = candidates.slice(0, 5);

    // 3. Construct Prompt
    const candidatesJson = topCandidates.map(inv => ({
      id: inv.id,
      seller: inv.sellerName,
      buyer: inv.buyerName,
      amount: inv.amount,
      date: inv.invoiceDate ? inv.invoiceDate.toISOString().split('T')[0] : 'N/A',
      taxRate: inv.taxRate || 'N/A',
      items: inv.itemName || 'N/A',
      remark: inv.remark || 'N/A' // Added invoice remark
    }));

    const prompt = `
    You are a professional financial reconciliation expert. Your task is to match a bank transaction to the most likely invoice from a list of candidates.

    Bank Transaction Details:
    - Payer: ${bankTx.payerName}
    - Amount: ${bankTx.amount}
    - Date: ${bankTx.transactionDate ? bankTx.transactionDate.toISOString().split('T')[0] : 'N/A'}
    - Remark/Description: ${bankTx.remark || 'None'}

    Candidate Invoices:
    ${JSON.stringify(candidatesJson, null, 2)}

    Analysis Guidelines:
    1. Semantic Matching: Check the "Payer" and "Remark" of the bank transaction against the "Seller", "Buyer", and "Remark" of each invoice.
    2. Proxy Payment Detection: If the "Payer" is an individual name but matches an invoice where the "Buyer" is a company (or vice versa), it is likely a proxy payment (代付).
    3. Date/Amount Logic: Normal reconciliation rules apply (dates close, amounts similar).
    4. Handling Fees: If the bank transaction remark explicitly mentions "handling fee" (手续费) and the amount difference between bank transaction and invoice is within 20 CNY, consider it a match. In this case, set "isHandlingFee" to true.

    Output format (JSON):
    {
      "matchFound": boolean,
      "candidateId": string | null,
      "confidence": number, // 0.0 to 1.0
      "reason": "Explain your reasoning (short Chinese)",
      "isHandlingFee": boolean, // true if the difference is caused by a handling fee mentioned in the remark
      "isProxy": boolean, // true if this is a person paying for a company or vice versa
      "proxyMapping": { "personName": string, "companyName": string } | null // Fill if isProxy is true
    }
    `;

    try {
      // 4. Call AI
      const analysis = await aiService.getJSON<{
        matchFound: boolean;
        candidateId: string | null;
        confidence: number;
        reason: string;
        isHandlingFee?: boolean;
        isProxy?: boolean;
        proxyMapping?: { personName: string; companyName: string } | null;
      }>(
        "Match transaction to invoice",
        prompt,
        0.1
      );

      if (analysis.matchFound && analysis.candidateId && analysis.confidence > 0.7) {
        const matchedInvoice = topCandidates.find(c => c.id === analysis.candidateId);

        if (matchedInvoice) {
          // Validate candidate is still pending (in case of async race, though here is serial)
          if (matchedInvoice.status !== 'pending') continue;

          const matchId = uuidv4();
          const isProxyMatch = !!analysis.isProxy;
          const isHandlingFeeMatch = !!analysis.isHandlingFee;

          // 如果是代付，自动保存映射关系
          if (isProxyMatch && analysis.proxyMapping) {
            const { personName, companyName } = analysis.proxyMapping;
            if (personName && companyName) {
              try {
                // 检查是否已存在
                const existing = await db.select()
                  .from(payerMappings)
                  .where(and(
                    eq(payerMappings.personName, personName),
                    eq(payerMappings.companyName, companyName)
                  ))
                  .limit(1);

                if (existing.length === 0) {
                  await db.insert(payerMappings).values({
                    id: uuidv4(),
                    personName,
                    companyName,
                    source: 'ai_extracted',
                    createdAt: new Date()
                  });
                  console.log(`[AI Match] 自动保存代付关系: ${personName} -> ${companyName}`);
                }
              } catch (e) {
                console.error('[AI Match] 自动保存代付记录失败:', e);
              }
            }
          }

          const matchRecord: any = {
            id: matchId,
            batchId,
            bankId: bankTx.id,
            invoiceId: matchedInvoice.id,
            matchType: isHandlingFeeMatch ? 'tolerance' : (isProxyMatch ? 'proxy' : 'ai'),
            confidence: analysis.confidence,
            reason: isHandlingFeeMatch
              ? `[AI 容差] ${analysis.reason} (备注提及手续费)`
              : analysis.reason,
            amountDiff: parseFloat((bankTx.amount - matchedInvoice.amount).toFixed(2)),
            needsConfirmation: false, // AI 识别出的手续费或代付默认自动确认
            confirmed: true,          // 直接标记为已确认
            proxyInfo: isProxyMatch && analysis.proxyMapping ? JSON.stringify(analysis.proxyMapping) : null,
            createdAt: new Date(),
          }

          await db.insert(matchResults).values(matchRecord)

          await db.update(bankTransactions)
            .set({ status: 'matched' })
            .where(eq(bankTransactions.id, bankTx.id))

          await db.update(invoices)
            .set({ status: 'matched' })
            .where(eq(invoices.id, matchedInvoice.id))

          matchedInvoice.status = 'matched';
          aiCount++;
        }
      }

    } catch (error) {
      console.error(`[AI Match] Error for tx ${bankTx.id}:`, error)
    }
  }

  // 5. Global Batch Analysis (Final check for non-obvious matches)
  const remainingBankAfterLoop = await db.select().from(bankTransactions)
    .where(and(eq(bankTransactions.batchId, batchId), eq(bankTransactions.status, 'pending')))
  const remainingInvoicesAfterLoop = await db.select().from(invoices)
    .where(and(eq(invoices.batchId, batchId), eq(invoices.status, 'pending')))

  if (remainingBankAfterLoop.length > 0 && remainingInvoicesAfterLoop.length > 0) {
    onProgress?.({
      current: total,
      total: total,
      matchedCount: aiCount,
      message: "正在进行全量 AI 综合对账分析..."
    });
    try {
      const prompt = `
      You are a professional financial reconciliation expert. Analyze these remaining items and find complex matches (one-to-one with indirect remarks, proxy payments, or handling fee cases).

      Bank Transactions:
      ${JSON.stringify(remainingBankAfterLoop.map(b => ({ id: b.id, payer: b.payerName, amount: b.amount, remark: b.remark })), null, 2)}

      Invoices:
      ${JSON.stringify(remainingInvoicesAfterLoop.map(inv => ({ id: inv.id, seller: inv.sellerName, amount: inv.amount, remark: inv.remark })), null, 2)}

      Guidelines:
      1. Handling Fees: If the bank transaction remark explicitly mentions "handling fee" (手续费) and the amount difference between bank transaction and invoice is within 20 CNY, consider it a match. Set "isHandlingFee" to true.
      2. Proxy Payments: If payer is different from buyer/seller but there is a semantic link, set "isProxy" to true and provide "proxyMapping".

      Output format (JSON):
      {
        "matches": [
          {
            "bankId": "string",
            "invoiceId": "string",
            "confidence": number,
            "reason": "Explain in Chinese",
            "isHandlingFee": boolean,
            "isProxy": boolean,
            "proxyMapping": { "personName": string, "companyName": string } | null
          }
        ]
      }
      `;

      const result = await aiService.getJSON<{
        matches: Array<{
          bankId: string;
          invoiceId: string;
          confidence: number;
          reason: string;
          isHandlingFee?: boolean;
          isProxy?: boolean;
          proxyMapping?: { personName: string; companyName: string } | null;
        }>
      }>(
        "Global Batch Match Analysis",
        prompt,
        0.1
      );

      if (result.matches && result.matches.length > 0) {
        for (const m of result.matches) {
          if (m.confidence > 0.8 && m.bankId && m.invoiceId) {
            const bank = remainingBankAfterLoop.find(b => b.id === m.bankId);
            const inv = remainingInvoicesAfterLoop.find(i => i.id === m.invoiceId);

            if (bank && inv && bank.status === 'pending' && inv.status === 'pending') {
              const matchId = uuidv4();
              const isProxyMatch = !!m.isProxy;
              const isHandlingFeeMatch = !!m.isHandlingFee;

              // 如果是代付，自动保存映射关系
              if (isProxyMatch && m.proxyMapping) {
                const { personName, companyName } = m.proxyMapping;
                if (personName && companyName) {
                  try {
                    const existing = await db.select()
                      .from(payerMappings)
                      .where(and(
                        eq(payerMappings.personName, personName),
                        eq(payerMappings.companyName, companyName)
                      ))
                      .limit(1);

                    if (existing.length === 0) {
                      await db.insert(payerMappings).values({
                        id: uuidv4(),
                        personName,
                        companyName,
                        source: 'ai_extracted',
                        createdAt: new Date()
                      });
                      console.log(`[Global AI] 自动保存代付关系: ${personName} -> ${companyName}`);
                    }
                  } catch (e) {
                    console.error('[Global AI] 自动保存代付记录失败:', e);
                  }
                }
              }

              const matchRecord: any = {
                id: matchId,
                batchId,
                bankId: m.bankId,
                invoiceId: m.invoiceId,
                matchType: isHandlingFeeMatch ? 'tolerance' : (isProxyMatch ? 'proxy' : 'ai'),
                confidence: m.confidence,
                reason: isHandlingFeeMatch
                  ? `[Global AI 容差] ${m.reason} (备注提及手续费)`
                  : `[Global AI] ${m.reason}`,
                amountDiff: parseFloat((bank.amount - inv.amount).toFixed(2)),
                needsConfirmation: false, // 自动确认
                confirmed: true,
                proxyInfo: isProxyMatch && m.proxyMapping ? JSON.stringify(m.proxyMapping) : null,
                createdAt: new Date(),
              };

              await db.insert(matchResults).values(matchRecord);
              await db.update(bankTransactions).set({ status: 'matched' }).where(eq(bankTransactions.id, m.bankId));
              await db.update(invoices).set({ status: 'matched' }).where(eq(invoices.id, m.invoiceId));
              aiCount++;
              bank.status = 'matched';
              inv.status = 'matched';
            }
          }
        }
      }
    } catch (e) {
      console.error("[AI Match] Global analysis failed:", e);
    }
  }

  // 6. 返回统计
  const finalBank = await db.select().from(bankTransactions)
    .where(and(eq(bankTransactions.batchId, batchId), eq(bankTransactions.status, 'pending')))
  const finalInvoice = await db.select().from(invoices)
    .where(and(eq(invoices.batchId, batchId), eq(invoices.status, 'pending')))

  return {
    perfectCount: 0,
    toleranceCount: 0,
    proxyCount: 0,
    aiCount,
    remainingBankCount: finalBank.length,
    remainingInvoiceCount: finalInvoice.length,
    duration: 0
  }
}
