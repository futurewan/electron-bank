/**
 * 配置 IPC 处理器
 * 处理渲染进程的配置读写请求
 */
import { ipcMain, IpcMainInvokeEvent } from 'electron'
import {
    AppConfig,
    getAllConfig,
    getConfig,
    resetConfig,
    setConfig
} from '../../config/store'
import { CONFIG_CHANNELS } from '../channels'

/**
 * 获取配置参数
 */
interface GetConfigParams {
  key: keyof AppConfig
}

/**
 * 设置配置参数
 */
interface SetConfigParams {
  key: keyof AppConfig
  value: any
}

/**
 * 处理获取单个配置
 */
async function handleGetConfig(_event: IpcMainInvokeEvent, params: GetConfigParams) {
  try {
    const value = getConfig(params.key)
    return { success: true, value }
  } catch (error) {
    console.error('[Config:Get] Error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 处理设置单个配置
 */
async function handleSetConfig(_event: IpcMainInvokeEvent, params: SetConfigParams) {
  try {
    setConfig(params.key, params.value)
    return { success: true }
  } catch (error) {
    console.error('[Config:Set] Error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 处理获取所有配置
 */
async function handleGetAllConfig(_event: IpcMainInvokeEvent) {
  try {
    const config = getAllConfig()
    return { success: true, config }
  } catch (error) {
    console.error('[Config:GetAll] Error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 处理重置配置
 */
async function handleResetConfig(_event: IpcMainInvokeEvent) {
  try {
    resetConfig()
    return { success: true }
  } catch (error) {
    console.error('[Config:Reset] Error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 注册配置 IPC 处理器
 */
export function registerConfigHandlers(): void {
  ipcMain.handle(CONFIG_CHANNELS.GET, handleGetConfig)
  ipcMain.handle(CONFIG_CHANNELS.SET, handleSetConfig)
  ipcMain.handle(CONFIG_CHANNELS.GET_ALL, handleGetAllConfig)
  ipcMain.handle(CONFIG_CHANNELS.RESET, handleResetConfig)
  
  console.log('[IPC] Config handlers registered')
}
