/**
 * 应用配置存储
 * 使用 electron-store 进行持久化
 */
import Store from 'electron-store'

/**
 * 窗口状态配置
 */
export interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized: boolean
}

/**
 * 应用配置类型
 */
export interface AppConfig {
  // 界面配置
  theme: 'light' | 'dark' | 'auto'
  language: 'zh-CN' | 'en-US'

  // 窗口状态
  window: WindowState

  // 功能配置
  autoSave: boolean
  exportPath: string

  // UI 状态
  sidebarCollapsed: boolean

  // 最近使用
  recentFiles: string[]
  lastOpenedPath?: string

  // 工作目录配置（单根路径，子目录自动生成）
  workspaceFolder?: string       // 工作目录根路径
}

// JSON Schema 验证
const schema = {
  theme: {
    type: 'string' as const,
    enum: ['light', 'dark', 'auto'],
    default: 'auto',
  },
  language: {
    type: 'string' as const,
    enum: ['zh-CN', 'en-US'],
    default: 'zh-CN',
  },
  window: {
    type: 'object' as const,
    properties: {
      width: { type: 'number' as const },
      height: { type: 'number' as const },
      x: { type: 'number' as const },
      y: { type: 'number' as const },
      maximized: { type: 'boolean' as const },
    },
    default: {
      width: 1200,
      height: 800,
      maximized: false,
    },
  },
  autoSave: {
    type: 'boolean' as const,
    default: true,
  },
  exportPath: {
    type: 'string' as const,
    default: '',
  },
  sidebarCollapsed: {
    type: 'boolean' as const,
    default: false,
  },
  recentFiles: {
    type: 'array' as const,
    items: { type: 'string' as const },
    default: [],
  },
  lastOpenedPath: {
    type: 'string' as const,
  },
  // 工作目录配置
  workspaceFolder: {
    type: 'string' as const,
  },
}

// 默认配置
const defaults: AppConfig = {
  theme: 'auto',
  language: 'zh-CN',
  window: {
    width: 1200,
    height: 800,
    maximized: false,
  },
  autoSave: true,
  exportPath: '',
  sidebarCollapsed: false,
  recentFiles: [],
  // 工作目录默认为 undefined
  workspaceFolder: undefined,
}

// 创建配置存储实例
export const configStore = new Store<AppConfig>({
  name: 'config',
  defaults,
  schema,
  clearInvalidConfig: true, // 清除无效配置
})

/**
 * 获取配置值
 */
export function getConfig<K extends keyof AppConfig>(key: K): AppConfig[K] {
  return configStore.get(key)
}

/**
 * 设置配置值
 */
export function setConfig<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
  configStore.set(key, value)
}

/**
 * 获取所有配置
 */
export function getAllConfig(): AppConfig {
  return configStore.store
}

/**
 * 重置为默认配置
 */
export function resetConfig(): void {
  configStore.clear()
  Object.entries(defaults).forEach(([key, value]) => {
    configStore.set(key as keyof AppConfig, value)
  })
}

/**
 * 更新窗口状态
 */
export function updateWindowState(state: Partial<WindowState>): void {
  const current = configStore.get('window')
  configStore.set('window', { ...current, ...state })
}

/**
 * 添加最近使用的文件
 */
export function addRecentFile(filePath: string, maxItems = 10): void {
  const recentFiles = configStore.get('recentFiles') || []

  // 移除已存在的相同路径
  const filtered = recentFiles.filter((f) => f !== filePath)

  // 添加到开头
  filtered.unshift(filePath)

  // 限制数量
  configStore.set('recentFiles', filtered.slice(0, maxItems))
}

/**
 * 清除最近使用的文件
 */
export function clearRecentFiles(): void {
  configStore.set('recentFiles', [])
}
