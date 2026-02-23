/**
 * AI 服务
 * 封装对 Electron AI API 的调用
 */
import type { AIConfig } from '../types/config'

/**
 * AI 分析结果
 */
export interface AnalysisResult {
  success: boolean
  result?: string
  tokens?: number
  model?: string
  error?: string
  errorType?: string
}

/**
 * 检查 Electron API 是否可用
 */
function checkElectronAPI(): boolean {
  return typeof window !== 'undefined' && !!window.electron?.ai
}

/**
 * AI 服务
 */
export const aiService = {
  /**
   * 设置 API Key
   */
  async setApiKey(provider: string, apiKey: string): Promise<{ success: boolean; error?: string }> {
    if (!checkElectronAPI()) {
      return { success: false, error: 'Electron API not available' }
    }
    return window.electron.ai.setKey(provider, apiKey)
  },

  /**
   * 验证 API Key
   */
  async checkApiKey(provider: string): Promise<{ valid: boolean; error?: string }> {
    if (!checkElectronAPI()) {
      return { valid: false, error: 'Electron API not available' }
    }
    return window.electron.ai.checkKey(provider)
  },

  /**
   * 移除 API Key
   */
  async removeApiKey(provider: string): Promise<{ success: boolean; error?: string }> {
    if (!checkElectronAPI()) {
      return { success: false, error: 'Electron API not available' }
    }
    return window.electron.ai.removeKey(provider)
  },

  /**
   * 获取 AI 配置
   */
  async getConfig(): Promise<AIConfig | undefined> {
    if (!checkElectronAPI()) {
      console.warn('[AI] Electron API not available')
      return undefined
    }
    const result = await window.electron.ai.getConfig()
    return result.success ? result.config : undefined
  },

  /**
   * 设置 AI 配置
   */
  async setConfig(config: Partial<Omit<AIConfig, 'hasApiKey' | 'totalTokensUsed' | 'lastUsedAt'>>): Promise<boolean> {
    if (!checkElectronAPI()) {
      return false
    }
    const result = await window.electron.ai.setConfig(config)
    return result.success
  },

  /**
   * 智能分析
   */
  async analyze(data: any, prompt: string): Promise<AnalysisResult> {
    if (!checkElectronAPI()) {
      return { success: false, error: 'Electron API not available' }
    }
    return window.electron.ai.analyze(data, prompt)
  },

  /**
   * 检查是否已配置 API Key
   */
  async hasApiKey(): Promise<boolean> {
    const config = await this.getConfig()
    return config?.hasApiKey || false
  },

  /**
   * 获取当前提供商
   */
  async getProvider(): Promise<string> {
    const config = await this.getConfig()
    return config?.provider || 'deepseek'
  },

  /**
   * 获取当前模型
   */
  async getModel(): Promise<string> {
    const config = await this.getConfig()
    return config?.model || 'deepseek-chat'
  },

  /**
   * 获取 Token 使用量
   */
  async getTokensUsed(): Promise<number> {
    const config = await this.getConfig()
    return config?.totalTokensUsed || 0
  },
}
