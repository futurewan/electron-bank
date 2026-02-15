/**
 * 配置服务
 * 封装对 Electron 配置 API 的调用
 */
import type { AppConfig } from '../types/config'

/**
 * 检查 Electron API 是否可用
 */
function checkElectronAPI(): boolean {
  return typeof window !== 'undefined' && !!window.electron?.config
}

/**
 * 配置服务
 */
export const configService = {
  /**
   * 获取单个配置项
   */
  async get<K extends keyof AppConfig>(key: K): Promise<AppConfig[K] | undefined> {
    if (!checkElectronAPI()) {
      console.warn('[Config] Electron API not available')
      return undefined
    }
    const result = await window.electron.config.get<AppConfig[K]>(key)
    return result.success ? result.value : undefined
  },

  /**
   * 设置单个配置项
   */
  async set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<boolean> {
    if (!checkElectronAPI()) {
      console.warn('[Config] Electron API not available')
      return false
    }
    const result = await window.electron.config.set(key, value)
    return result.success
  },

  /**
   * 获取所有配置
   */
  async getAll(): Promise<AppConfig | undefined> {
    if (!checkElectronAPI()) {
      console.warn('[Config] Electron API not available')
      return undefined
    }
    const result = await window.electron.config.getAll()
    return result.success ? result.config : undefined
  },

  /**
   * 重置配置
   */
  async reset(): Promise<boolean> {
    if (!checkElectronAPI()) {
      console.warn('[Config] Electron API not available')
      return false
    }
    const result = await window.electron.config.reset()
    return result.success
  },

  /**
   * 获取主题设置
   */
  async getTheme(): Promise<AppConfig['theme']> {
    return (await this.get('theme')) || 'auto'
  },

  /**
   * 设置主题
   */
  async setTheme(theme: AppConfig['theme']): Promise<boolean> {
    return this.set('theme', theme)
  },

  /**
   * 获取语言设置
   */
  async getLanguage(): Promise<AppConfig['language']> {
    return (await this.get('language')) || 'zh-CN'
  },

  /**
   * 设置语言
   */
  async setLanguage(language: AppConfig['language']): Promise<boolean> {
    return this.set('language', language)
  },

  /**
   * 获取侧边栏状态
   */
  async getSidebarCollapsed(): Promise<boolean> {
    return (await this.get('sidebarCollapsed')) || false
  },

  /**
   * 设置侧边栏状态
   */
  async setSidebarCollapsed(collapsed: boolean): Promise<boolean> {
    return this.set('sidebarCollapsed', collapsed)
  },
}
