/**
 * 数据脱敏工具
 * 防止敏感财务信息（银行账号、账户余额等）上传至 AI
 */

/**
 * 脱敏银行账号
 * 保留前 4 位和后 4 位，中间遮码
 */
export function maskBankAccount(account: string | null | undefined): string | null {
  if (!account) return null
  const str = account.toString().trim()
  if (str.length <= 8) return '****'
  return `${str.slice(0, 4)}****${str.slice(-4)}`
}

/**
 * 脱敏备注信息中的数字敏感模式
 * - 银行账号（13-19位数字）
 * - 余额信息（关键字+数值）
 */
export function maskRemark(remark: string | null | undefined): string | null {
  if (!remark) return null
  const original = remark.toString()
  let sanitized = original

  // 1. 脱敏可能的银行账号 (13-19位连续数字)
  sanitized = sanitized.replace(/\b\d{13,19}\b/g, (val) => {
    return `${val.slice(0, 4)}****${val.slice(-4)}`
  })

  // 2. 脱敏账户余额
  // 匹配类似 "余额: 123,456.78", "Balance: 1234.56", "余额1234.56"
  const balanceKeywords = ['余额', '账户余额', '账号余额', 'Balance', 'Account Balance', 'Bal']
  balanceKeywords.forEach(kw => {
    // 构造正则：关键字 + 可选冒号/空格 + 数字格式（含逗号和点）
    const regex = new RegExp(`(${kw}[:：\\s]?)(\\d+[\\d,\\s.]*\\d)`, 'gi')
    sanitized = sanitized.replace(regex, (_match, p1, _p2) => {
      // 如果后面看起来像是一个纯粹的金额（且包含在余额语境下），则遮蔽
      return `${p1}[MASK_BALANCE]`
    })
  })

  if (original !== sanitized) {
    console.log(`[Sanitization] 备注已脱敏 -> 原文: "${original}" | 脱敏后: "${sanitized}"`)
  }

  return sanitized
}

/**
 * 结构化交易数据脱敏
 */
export function sanitizeTransaction(tx: any): any {
  if (!tx) return tx
  const result = { ...tx }

  // 1. 物理删除或脱敏账号字段
  if ('payerAccount' in result) {
    const original = result.payerAccount;
    result.payerAccount = maskBankAccount(result.payerAccount)
    if (original !== result.payerAccount) {
      console.log(`[Sanitization] 账号已脱敏: ${original} -> ${result.payerAccount}`)
    }
  }
  if ('payer_account' in result) {
    result.payer_account = maskBankAccount(result.payer_account)
  }

  // 2. 脱敏备注
  if ('remark' in result) {
    result.remark = maskRemark(result.remark)
  }

  // 3. 删除流水号（如果不需要 AI 环境识别的话）
  // 注意：某些对账可能需要流水号做语义关联，但用户明确要求不上传，所以我们移除敏感部分
  if ('transactionNo' in result) {
    console.log(`[Sanitization] 删除流水号字段: ${result.transactionNo}`)
    delete result.transactionNo
  }
  if ('transaction_no' in result) {
    delete result.transaction_no
  }

  // 4. 删除账户余额字段（如果有的话）
  const balanceFields = ['balance', 'accountBalance', 'account_balance', 'curBalance', 'cur_balance']
  balanceFields.forEach(f => {
    if (f in result) {
      console.log(`[Sanitization] 删除余额字段 [${f}]: ${result[f]}`)
      delete result[f]
    }
  })

  return result
}
