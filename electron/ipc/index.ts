/**
 * IPC 处理器注册入口
 */
import { app, ipcMain, IpcMainInvokeEvent, shell } from 'electron'
import { APP_CHANNELS } from './channels'
import { registerAIHandlers } from './handlers/ai'
import { registerConfigHandlers } from './handlers/config'
import { registerDatabaseHandlers } from './handlers/database'
import { registerFileHandlers } from './handlers/file'
import { registerReconciliationHandlers } from './handlers/reconciliation'

/**
 * 注册应用通用处理器
 */
function registerAppHandlers(): void {
  // 获取应用版本
  ipcMain.handle(APP_CHANNELS.GET_VERSION, () => {
    return app.getVersion()
  })
  
  // 获取平台信息
  ipcMain.handle(APP_CHANNELS.GET_PLATFORM, () => {
    return process.platform
  })
  
  // 在外部浏览器打开链接
  ipcMain.handle(APP_CHANNELS.OPEN_EXTERNAL, async (_event: IpcMainInvokeEvent, params: { url: string }) => {
    await shell.openExternal(params.url)
  })
  
  // 在文件管理器中显示文件
  ipcMain.handle(APP_CHANNELS.SHOW_IN_FOLDER, async (_event: IpcMainInvokeEvent, params: { filePath: string }) => {
    shell.showItemInFolder(params.filePath)
  })
  
  // 打开指定路径（文件夹或文件）
  ipcMain.handle(APP_CHANNELS.OPEN_PATH, async (_event: IpcMainInvokeEvent, params: { path: string }) => {
    return shell.openPath(params.path)
  })
  
  console.log('[IPC] App handlers registered')
}

/**
 * 注册所有 IPC 处理器
 */
export function registerAllIpcHandlers(): void {
  console.log('[IPC] Registering all handlers...')
  
  registerDatabaseHandlers()
  registerConfigHandlers()
  registerFileHandlers()
  registerAIHandlers()
  registerReconciliationHandlers()
  registerAppHandlers()
  
  console.log('[IPC] All handlers registered successfully')
}

// 导出通道常量
export * from './channels'

