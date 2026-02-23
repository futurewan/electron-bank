/**
 * AI IPC 处理器
 * 处理渲染进程的 AI 操作请求
 */
import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { aiConfig, AIKeyManager } from '../../config/aiStore'
import { AIError, aiService } from '../../services/aiService'
import { AI_CHANNELS } from '../channels'

/**
 * 设置 Key 参数
 */
interface SetKeyParams {
  provider: string
  apiKey: string
}

/**
 * 检查 Key 参数
 */
interface CheckKeyParams {
  provider: string
}

/**
 * 移除 Key 参数
 */
interface RemoveKeyParams {
  provider: string
}

/**
 * 设置配置参数
 */
interface SetConfigParams {
  provider?: 'openai' | 'anthropic' | 'custom' | 'deepseek'
  model?: string
  temperature?: number
  maxTokens?: number
  customEndpoint?: string
}

/**
 * 分析参数
 */
interface AnalyzeParams {
  data: any
  prompt: string
}

/**
 * 处理设置 API Key
 */
async function handleSetKey(_event: IpcMainInvokeEvent, params: SetKeyParams) {
  try {
    const { provider, apiKey } = params

    if (!provider || !apiKey) {
      return { success: false, error: '参数不完整' }
    }

    // 验证 key 格式
    if (provider === 'openai' && !apiKey.startsWith('sk-')) {
      return { success: false, error: 'OpenAI API Key 应以 sk- 开头' }
    }

    AIKeyManager.setApiKey(provider, apiKey)

    // 重置 AI 服务客户端
    aiService.resetClient()

    return { success: true }
  } catch (error) {
    console.error('[AI:SetKey] Error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 处理检查 API Key
 */
async function handleCheckKey(_event: IpcMainInvokeEvent, params: CheckKeyParams) {
  try {
    const { provider } = params

    if (!AIKeyManager.hasApiKey(provider)) {
      return { valid: false, error: '未配置 API Key' }
    }

    const result = await aiService.validateApiKey(provider)
    return result
  } catch (error) {
    console.error('[AI:CheckKey] Error:', error)
    return { valid: false, error: String(error) }
  }
}

/**
 * 处理移除 API Key
 */
async function handleRemoveKey(_event: IpcMainInvokeEvent, params: RemoveKeyParams) {
  try {
    const { provider } = params
    AIKeyManager.removeApiKey(provider)

    // 重置 AI 服务客户端
    aiService.resetClient()

    return { success: true }
  } catch (error) {
    console.error('[AI:RemoveKey] Error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 处理获取配置
 */
async function handleGetConfig(_event: IpcMainInvokeEvent) {
  try {
    const config = aiConfig.getSummary()
    return { success: true, config }
  } catch (error) {
    console.error('[AI:GetConfig] Error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 处理设置配置
 */
async function handleSetConfig(_event: IpcMainInvokeEvent, params: SetConfigParams) {
  try {
    // 验证参数
    if (params.temperature !== undefined) {
      if (params.temperature < 0 || params.temperature > 2) {
        return { success: false, error: 'temperature 必须在 0-2 之间' }
      }
    }

    if (params.maxTokens !== undefined) {
      if (params.maxTokens < 100 || params.maxTokens > 128000) {
        return { success: false, error: 'maxTokens 必须在 100-128000 之间' }
      }
    }

    aiConfig.set(params)

    // 如果 provider 变化，重置客户端
    if (params.provider || params.customEndpoint) {
      aiService.resetClient()
    }

    return { success: true }
  } catch (error) {
    console.error('[AI:SetConfig] Error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 处理 AI 分析请求
 */
async function handleAnalyze(_event: IpcMainInvokeEvent, params: AnalyzeParams) {
  try {
    const { data, prompt } = params

    if (!prompt) {
      return { success: false, error: '请提供分析提示' }
    }

    const result = await aiService.analyze(data, prompt)

    return {
      success: true,
      result: result.result,
      tokens: result.tokens,
      model: result.model,
    }
  } catch (error) {
    console.error('[AI:Analyze] Error:', error)

    if (error instanceof AIError) {
      return {
        success: false,
        error: error.message,
        errorType: error.type,
      }
    }

    return { success: false, error: String(error) }
  }
}

/**
 * 注册 AI IPC 处理器
 */
export function registerAIHandlers(): void {
  ipcMain.handle(AI_CHANNELS.SET_KEY, handleSetKey)
  ipcMain.handle(AI_CHANNELS.CHECK_KEY, handleCheckKey)
  ipcMain.handle(AI_CHANNELS.REMOVE_KEY, handleRemoveKey)
  ipcMain.handle(AI_CHANNELS.GET_CONFIG, handleGetConfig)
  ipcMain.handle(AI_CHANNELS.SET_CONFIG, handleSetConfig)
  ipcMain.handle(AI_CHANNELS.ANALYZE, handleAnalyze)

  console.log('[IPC] AI handlers registered')
}
