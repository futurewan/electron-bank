/**
 * AI 服务
 * 封装 OpenAI API 调用
 */
import OpenAI from 'openai'
import { AIKeyManager, aiConfig } from '../config/aiStore'

/**
 * AI 错误类型
 */
export enum AIErrorType {
  NO_API_KEY = 'NO_API_KEY',
  INVALID_KEY = 'INVALID_KEY',
  RATE_LIMIT = 'RATE_LIMIT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  SERVICE_ERROR = 'SERVICE_ERROR',
  UNKNOWN = 'UNKNOWN',
}

/**
 * AI 错误
 */
export class AIError extends Error {
  type: AIErrorType
  
  constructor(type: AIErrorType, message: string) {
    super(message)
    this.type = type
    this.name = 'AIError'
  }
}

/**
 * 分析结果
 */
export interface AnalysisResult {
  result: string
  tokens: number
  model: string
}

/**
 * AI 服务类
 */
export class AIService {
  private client: OpenAI | null = null
  
  /**
   * 获取 OpenAI 客户端
   */
  private getClient(): OpenAI {
    const config = aiConfig.get()
    const apiKey = AIKeyManager.getApiKey(config.provider)
    
    if (!apiKey) {
      throw new AIError(AIErrorType.NO_API_KEY, '请先配置 AI API Key')
    }
    
    // 如果 key 变化或者 client 不存在，重新创建
    if (!this.client) {
      this.client = new OpenAI({
        apiKey,
        baseURL: config.customEndpoint || undefined,
        timeout: 60000, // 60 秒超时
        maxRetries: 2,
      })
    }
    
    return this.client
  }

  /**
   * 重置客户端（当 key 变化时调用）
   */
  resetClient(): void {
    this.client = null
  }

  /**
   * 验证 API Key 是否有效
   */
  async validateApiKey(provider: string): Promise<{ valid: boolean; error?: string }> {
    const apiKey = AIKeyManager.getApiKey(provider)
    
    if (!apiKey) {
      return { valid: false, error: '未配置 API Key' }
    }
    
    try {
      const client = new OpenAI({ apiKey })
      
      // 发送一个简单请求来验证
      await client.models.list()
      
      return { valid: true }
    } catch (error: any) {
      if (error?.status === 401) {
        return { valid: false, error: 'API Key 无效' }
      }
      if (error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED') {
        return { valid: false, error: '网络连接失败' }
      }
      return { valid: false, error: error?.message || '验证失败' }
    }
  }

  /**
   * 智能对账分析
   */
  async analyze(data: any, prompt: string): Promise<AnalysisResult> {
    const client = this.getClient()
    const config = aiConfig.get()
    
    try {
      const systemPrompt = `你是一个专业的财务对账分析助手。你的任务是帮助用户分析账单数据，识别差异，找出问题原因，并提供解决建议。

请按照以下格式回复：
1. **数据概览**：简要总结输入数据
2. **差异分析**：指出发现的差异或问题
3. **可能原因**：分析造成差异的可能原因
4. **建议操作**：给出具体的解决建议

保持回复简洁专业，使用中文。`

      const response = await client.chat.completions.create({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: `${prompt}\n\n数据：\n${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}` 
          },
        ],
        temperature: config.temperature,
        max_tokens: config.maxTokens,
      })
      
      const result = response.choices[0]?.message?.content || '分析失败，请重试'
      const tokens = response.usage?.total_tokens || 0
      
      // 记录 token 使用量
      aiConfig.addTokensUsed(tokens)
      
      return {
        result,
        tokens,
        model: response.model,
      }
    } catch (error: any) {
      throw this.handleError(error)
    }
  }

  /**
   * 异常检测
   */
  async detectAnomalies(transactions: any[]): Promise<AnalysisResult> {
    const client = this.getClient()
    const config = aiConfig.get()
    
    try {
      const systemPrompt = `你是一个财务异常检测专家。分析以下交易数据，识别可能的异常：
- 金额异常（过大、过小、重复）
- 时间异常（非工作时间、节假日）
- 模式异常（与历史不符）
- 其他可疑情况

对每个发现的异常，说明原因和建议。`

      const response = await client.chat.completions.create({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: `请分析以下 ${transactions.length} 条交易数据：\n${JSON.stringify(transactions, null, 2)}` 
          },
        ],
        temperature: 0.3, // 异常检测用较低温度
        max_tokens: config.maxTokens,
      })
      
      const result = response.choices[0]?.message?.content || '分析失败'
      const tokens = response.usage?.total_tokens || 0
      
      aiConfig.addTokensUsed(tokens)
      
      return {
        result,
        tokens,
        model: response.model,
      }
    } catch (error: any) {
      throw this.handleError(error)
    }
  }

  /**
   * 生成对账报告
   */
  async generateReport(data: {
    summary: any
    matchedRecords: number
    unmatchedRecords: number
    totalAmount: number
    discrepancy: number
  }): Promise<AnalysisResult> {
    const client = this.getClient()
    const config = aiConfig.get()
    
    try {
      const systemPrompt = `你是一个专业的财务报告撰写专家。根据对账数据生成一份简洁专业的对账报告。

报告应包含：
1. 对账概述
2. 关键数据指标
3. 差异说明
4. 建议和下一步行动

使用表格或列表使报告更清晰。`

      const response = await client.chat.completions.create({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: `请根据以下对账数据生成报告：\n${JSON.stringify(data, null, 2)}` 
          },
        ],
        temperature: 0.5,
        max_tokens: config.maxTokens,
      })
      
      const result = response.choices[0]?.message?.content || '报告生成失败'
      const tokens = response.usage?.total_tokens || 0
      
      aiConfig.addTokensUsed(tokens)
      
      return {
        result,
        tokens,
        model: response.model,
      }
    } catch (error: any) {
      throw this.handleError(error)
    }
  }

  /**
   * 自由对话
   */
  async chat(messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>): Promise<AnalysisResult> {
    const client = this.getClient()
    const config = aiConfig.get()
    
    try {
      const response = await client.chat.completions.create({
        model: config.model,
        messages: messages as any,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
      })
      
      const result = response.choices[0]?.message?.content || ''
      const tokens = response.usage?.total_tokens || 0
      
      aiConfig.addTokensUsed(tokens)
      
      return {
        result,
        tokens,
        model: response.model,
      }
    } catch (error: any) {
      throw this.handleError(error)
    }
  }

  /**
   * 处理错误
   */
  private handleError(error: any): AIError {
    console.error('[AI] Error:', error)
    
    if (error instanceof AIError) {
      return error
    }
    
    // OpenAI API 错误
    if (error?.status) {
      switch (error.status) {
        case 401:
          return new AIError(AIErrorType.INVALID_KEY, 'API Key 无效，请检查配置')
        case 429:
          return new AIError(AIErrorType.RATE_LIMIT, '请求过于频繁，请稍后再试')
        case 500:
        case 502:
        case 503:
          return new AIError(AIErrorType.SERVICE_ERROR, 'AI 服务暂时不可用，请稍后再试')
        default:
          return new AIError(AIErrorType.SERVICE_ERROR, error.message || '服务错误')
      }
    }
    
    // 网络错误
    if (error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED' || error?.code === 'ETIMEDOUT') {
      return new AIError(AIErrorType.NETWORK_ERROR, '网络连接失败，请检查网络')
    }
    
    return new AIError(AIErrorType.UNKNOWN, error?.message || '未知错误')
  }
}

// 导出单例
export const aiService = new AIService()
