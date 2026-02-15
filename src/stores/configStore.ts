/**
 * 配置状态管理
 */
import { create } from 'zustand'
import { aiService } from '../services/ai'
import { configService } from '../services/config'
import type { AIConfig, AppConfig } from '../types/config'

interface ConfigState {
  // 应用配置
  appConfig: AppConfig | null
  aiConfig: AIConfig | null
  
  // 状态
  loading: boolean
  error: string | null
  
  // 动作
  loadConfig: () => Promise<void>
  loadAIConfig: () => Promise<void>
  setTheme: (theme: AppConfig['theme']) => Promise<void>
  setLanguage: (language: AppConfig['language']) => Promise<void>
  setSidebarCollapsed: (collapsed: boolean) => Promise<void>
  setAIApiKey: (provider: string, apiKey: string) => Promise<{ success: boolean; error?: string }>
  setAIModel: (model: string) => Promise<void>
  resetConfig: () => Promise<void>
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  // 初始状态
  appConfig: null,
  aiConfig: null,
  loading: false,
  error: null,

  /**
   * 加载应用配置
   */
  loadConfig: async () => {
    set({ loading: true, error: null })
    
    try {
      const config = await configService.getAll()
      set({ appConfig: config || null, loading: false })
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : '加载配置失败',
      })
    }
  },

  /**
   * 加载 AI 配置
   */
  loadAIConfig: async () => {
    try {
      const config = await aiService.getConfig()
      set({ aiConfig: config || null })
    } catch (error) {
      console.error('Failed to load AI config:', error)
    }
  },

  /**
   * 设置主题
   */
  setTheme: async (theme: AppConfig['theme']) => {
    const success = await configService.setTheme(theme)
    if (success) {
      set((state) => ({
        appConfig: state.appConfig ? { ...state.appConfig, theme } : null,
      }))
    }
  },

  /**
   * 设置语言
   */
  setLanguage: async (language: AppConfig['language']) => {
    const success = await configService.setLanguage(language)
    if (success) {
      set((state) => ({
        appConfig: state.appConfig ? { ...state.appConfig, language } : null,
      }))
    }
  },

  /**
   * 设置侧边栏状态
   */
  setSidebarCollapsed: async (collapsed: boolean) => {
    const success = await configService.setSidebarCollapsed(collapsed)
    if (success) {
      set((state) => ({
        appConfig: state.appConfig ? { ...state.appConfig, sidebarCollapsed: collapsed } : null,
      }))
    }
  },

  /**
   * 设置 AI API Key
   */
  setAIApiKey: async (provider: string, apiKey: string) => {
    const result = await aiService.setApiKey(provider, apiKey)
    if (result.success) {
      await get().loadAIConfig()
    }
    return result
  },

  /**
   * 设置 AI 模型
   */
  setAIModel: async (model: string) => {
    const success = await aiService.setConfig({ model })
    if (success) {
      set((state) => ({
        aiConfig: state.aiConfig ? { ...state.aiConfig, model } : null,
      }))
    }
  },

  /**
   * 重置配置
   */
  resetConfig: async () => {
    await configService.reset()
    await get().loadConfig()
  },
}))
