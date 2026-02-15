/**
 * AI 配置和 API Key 安全存储
 * 使用 Electron safeStorage 进行加密
 */
import { safeStorage } from 'electron'
import Store from 'electron-store'

/**
 * AI 配置类型
 */
export interface AIConfig {
  // 提供商
  provider: 'openai' | 'anthropic' | 'custom'
  
  // 模型配置
  model: string
  temperature: number
  maxTokens: number
  
  // 自定义端点（可选）
  customEndpoint?: string
  
  // 统计信息
  totalTokensUsed: number
  lastUsedAt?: number
}

/**
 * 加密的 Key 存储
 */
interface EncryptedKeys {
  openai?: string
  anthropic?: string
  custom?: string
}

// 默认 AI 配置
const defaultAIConfig: AIConfig = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  maxTokens: 2000,
  totalTokensUsed: 0,
}

// 创建配置存储实例
const aiConfigStore = new Store<AIConfig>({
  name: 'ai-config',
  defaults: defaultAIConfig,
})

// 加密 Key 存储实例
const keyStore = new Store<{ keys: EncryptedKeys }>({
  name: 'ai-keys',
  defaults: { keys: {} },
})

/**
 * AI Key 管理器
 */
export class AIKeyManager {
  /**
   * 检查 safeStorage 是否可用
   */
  static isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  /**
   * 设置 API Key（加密存储）
   */
  static setApiKey(provider: string, apiKey: string): void {
    if (!apiKey) {
      throw new Error('API Key 不能为空')
    }
    
    if (safeStorage.isEncryptionAvailable()) {
      // 使用系统级加密
      const encrypted = safeStorage.encryptString(apiKey)
      const base64 = encrypted.toString('base64')
      
      const keys = keyStore.get('keys') || {}
      keys[provider as keyof EncryptedKeys] = base64
      keyStore.set('keys', keys)
      
      console.log(`[AI] API Key for ${provider} saved (encrypted)`)
    } else {
      // 回退：不加密存储（不推荐，仅用于开发）
      console.warn('[AI] safeStorage not available, storing key unencrypted')
      const keys = keyStore.get('keys') || {}
      keys[provider as keyof EncryptedKeys] = apiKey
      keyStore.set('keys', keys)
    }
  }

  /**
   * 获取 API Key（解密）
   */
  static getApiKey(provider: string): string | null {
    const keys = keyStore.get('keys') || {}
    const stored = keys[provider as keyof EncryptedKeys]
    
    if (!stored) {
      return null
    }
    
    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(stored, 'base64')
        return safeStorage.decryptString(buffer)
      } catch (error) {
        console.error(`[AI] Failed to decrypt key for ${provider}:`, error)
        return null
      }
    } else {
      // 回退：直接返回
      return stored
    }
  }

  /**
   * 检查是否有 API Key
   */
  static hasApiKey(provider: string): boolean {
    const keys = keyStore.get('keys') || {}
    return !!keys[provider as keyof EncryptedKeys]
  }

  /**
   * 移除 API Key
   */
  static removeApiKey(provider: string): void {
    const keys = keyStore.get('keys') || {}
    delete keys[provider as keyof EncryptedKeys]
    keyStore.set('keys', keys)
    console.log(`[AI] API Key for ${provider} removed`)
  }

  /**
   * 获取所有已配置的提供商
   */
  static getConfiguredProviders(): string[] {
    const keys = keyStore.get('keys') || {}
    return Object.keys(keys).filter((key) => !!keys[key as keyof EncryptedKeys])
  }

  /**
   * 清除所有 API Key
   */
  static clearAllKeys(): void {
    keyStore.set('keys', {})
    console.log('[AI] All API Keys cleared')
  }
}

/**
 * AI 配置管理
 */
export const aiConfig = {
  /**
   * 获取 AI 配置
   */
  get(): AIConfig {
    return aiConfigStore.store
  },

  /**
   * 设置 AI 配置
   */
  set(config: Partial<AIConfig>): void {
    Object.entries(config).forEach(([key, value]) => {
      aiConfigStore.set(key as keyof AIConfig, value)
    })
  },

  /**
   * 获取单个配置项
   */
  getItem<K extends keyof AIConfig>(key: K): AIConfig[K] {
    return aiConfigStore.get(key)
  },

  /**
   * 设置单个配置项
   */
  setItem<K extends keyof AIConfig>(key: K, value: AIConfig[K]): void {
    aiConfigStore.set(key, value)
  },

  /**
   * 重置为默认配置
   */
  reset(): void {
    aiConfigStore.clear()
    Object.entries(defaultAIConfig).forEach(([key, value]) => {
      aiConfigStore.set(key as keyof AIConfig, value)
    })
  },

  /**
   * 增加 Token 使用量
   */
  addTokensUsed(tokens: number): void {
    const current = aiConfigStore.get('totalTokensUsed') || 0
    aiConfigStore.set('totalTokensUsed', current + tokens)
    aiConfigStore.set('lastUsedAt', Date.now())
  },

  /**
   * 获取配置摘要（用于渲染进程，不包含敏感信息）
   */
  getSummary(): AIConfig & { hasApiKey: boolean } {
    const config = aiConfigStore.store
    return {
      ...config,
      hasApiKey: AIKeyManager.hasApiKey(config.provider),
    }
  },
}
