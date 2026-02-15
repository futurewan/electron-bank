/**
 * 文件 IPC 处理器
 * 处理渲染进程的文件操作请求
 */
import { ipcMain, IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import {
  deleteFile,
  listExportFiles,
  listImportFiles,
  openFileDialog,
  readFile,
  saveFileDialog,
  saveToExports,
  saveToImports
} from '../../utils/fileManager'
import { FILE_CHANNELS } from '../channels'

/**
 * 导入文件参数
 */
interface ImportParams {
  type?: 'excel' | 'csv' | 'json'
}

/**
 * 导出文件参数
 */
interface ExportParams {
  content: string
  filename: string
  type?: 'excel' | 'csv' | 'json' | 'pdf'
}

/**
 * 删除文件参数
 */
interface DeleteFileParams {
  filePath: string
}

/**
 * 打开对话框参数
 */
interface OpenDialogParams {
  title?: string
  filters?: Electron.FileFilter[]
  multiple?: boolean
}

/**
 * 保存对话框参数
 */
interface SaveDialogParams {
  title?: string
  defaultPath?: string
  filters?: Electron.FileFilter[]
}

/**
 * 根据文件类型获取过滤器
 */
function getFilters(type?: string): Electron.FileFilter[] {
  switch (type) {
    case 'excel':
      return [{ name: 'Excel 文件', extensions: ['xlsx', 'xls'] }]
    case 'csv':
      return [{ name: 'CSV 文件', extensions: ['csv'] }]
    case 'json':
      return [{ name: 'JSON 文件', extensions: ['json'] }]
    case 'pdf':
      return [{ name: 'PDF 文件', extensions: ['pdf'] }]
    default:
      return [
        { name: 'Excel 文件', extensions: ['xlsx', 'xls'] },
        { name: 'CSV 文件', extensions: ['csv'] },
        { name: '所有文件', extensions: ['*'] },
      ]
  }
}

/**
 * 处理文件导入
 */
async function handleFileImport(_event: IpcMainInvokeEvent, params: ImportParams) {
  try {
    const filters = getFilters(params.type)
    const filePaths = await openFileDialog({ filters, multiple: false })

    if (filePaths.length === 0) {
      return { success: false, canceled: true }
    }

    const sourceFilePath = filePaths[0]

    // 复制到导入目录
    const savedPath = await saveToImports(sourceFilePath)

    // 读取文件内容
    const content = await readFile(sourceFilePath)

    return {
      success: true,
      filePath: savedPath,
      originalPath: sourceFilePath,
      fileName: path.basename(sourceFilePath),
      content: content.toString('base64'), // 以 base64 返回
    }
  } catch (error) {
    console.error('[File:Import] Error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 处理文件导出
 */
async function handleFileExport(_event: IpcMainInvokeEvent, params: ExportParams) {
  try {
    const { content, filename, type: _type } = params

    // 保存到导出目录
    const savedPath = await saveToExports(content, filename)

    return {
      success: true,
      filePath: savedPath,
    }
  } catch (error) {
    console.error('[File:Export] Error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 处理列出导入文件
 */
async function handleListImports(_event: IpcMainInvokeEvent) {
  try {
    const files = await listImportFiles()
    return { success: true, files }
  } catch (error) {
    console.error('[File:ListImports] Error:', error)
    return { success: false, error: String(error), files: [] }
  }
}

/**
 * 处理列出导出文件
 */
async function handleListExports(_event: IpcMainInvokeEvent) {
  try {
    const files = await listExportFiles()
    return { success: true, files }
  } catch (error) {
    console.error('[File:ListExports] Error:', error)
    return { success: false, error: String(error), files: [] }
  }
}

/**
 * 处理删除文件
 */
async function handleDeleteFile(_event: IpcMainInvokeEvent, params: DeleteFileParams) {
  try {
    await deleteFile(params.filePath)
    return { success: true }
  } catch (error) {
    console.error('[File:Delete] Error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 处理打开文件对话框
 */
async function handleOpenDialog(_event: IpcMainInvokeEvent, params: OpenDialogParams) {
  try {
    const filePaths = await openFileDialog(params)
    return {
      success: true,
      canceled: filePaths.length === 0,
      filePaths,
    }
  } catch (error) {
    console.error('[File:OpenDialog] Error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 处理保存文件对话框
 */
async function handleSaveDialog(_event: IpcMainInvokeEvent, params: SaveDialogParams) {
  try {
    const filePath = await saveFileDialog(params)
    return {
      success: true,
      canceled: !filePath,
      filePath,
    }
  } catch (error) {
    console.error('[File:SaveDialog] Error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * 选择文件夹参数
 */
interface SelectFolderParams {
  title?: string
}

/**
 * 扫描文件夹参数
 */
interface ScanFolderParams {
  folderPath: string
}

/**
 * 处理选择文件夹
 */
async function handleSelectFolder(_event: IpcMainInvokeEvent, params: SelectFolderParams) {
  try {
    const { selectFolder } = await import('../../services/folderService')
    return await selectFolder(params.title)
  } catch (error) {
    console.error('[File:SelectFolder] Error:', error)
    return { success: false, canceled: false, error: String(error) }
  }
}

/**
 * 处理扫描文件夹
 */
async function handleScanFolder(_event: IpcMainInvokeEvent, params: ScanFolderParams) {
  try {
    const { scanExcelFiles } = await import('../../services/folderService')
    return await scanExcelFiles(params.folderPath)
  } catch (error) {
    console.error('[File:ScanFolder] Error:', error)
    return { success: false, files: [], hasMore: false, error: String(error) }
  }
}

/**
 * 初始化工作目录结构参数
 */
interface InitWorkspaceParams {
  rootPath: string
}

/**
 * 处理初始化工作目录结构
 */
async function handleInitWorkspace(_event: IpcMainInvokeEvent, params: InitWorkspaceParams) {
  try {
    const { initWorkspaceStructure } = await import('../../services/folderService')
    return initWorkspaceStructure(params.rootPath)
  } catch (error) {
    console.error('[File:InitWorkspace] Error:', error)
    return { success: false, created: [], error: String(error) }
  }
}

/**
 * 验证工作目录参数
 */
interface ValidateWorkspaceParams {
  workspaceFolder: string
}

/**
 * 处理验证工作目录
 */
async function handleValidateWorkspace(_event: IpcMainInvokeEvent, params: ValidateWorkspaceParams) {
  try {
    const { validateWorkspace } = await import('../../services/folderService')
    return validateWorkspace(params.workspaceFolder)
  } catch (error) {
    console.error('[File:ValidateWorkspace] Error:', error)
    return { valid: false, rebuilt: false, error: String(error) }
  }
}

/**
 * 注册文件 IPC 处理器
 */
export function registerFileHandlers(): void {
  ipcMain.handle(FILE_CHANNELS.IMPORT, handleFileImport)
  ipcMain.handle(FILE_CHANNELS.EXPORT, handleFileExport)
  ipcMain.handle(FILE_CHANNELS.LIST_IMPORTS, handleListImports)
  ipcMain.handle(FILE_CHANNELS.LIST_EXPORTS, handleListExports)
  ipcMain.handle(FILE_CHANNELS.DELETE, handleDeleteFile)
  ipcMain.handle(FILE_CHANNELS.OPEN_DIALOG, handleOpenDialog)
  ipcMain.handle(FILE_CHANNELS.SAVE_DIALOG, handleSaveDialog)
  ipcMain.handle(FILE_CHANNELS.SELECT_FOLDER, handleSelectFolder)
  ipcMain.handle(FILE_CHANNELS.SCAN_FOLDER, handleScanFolder)
  ipcMain.handle(FILE_CHANNELS.INIT_WORKSPACE, handleInitWorkspace)
  ipcMain.handle(FILE_CHANNELS.VALIDATE_WORKSPACE, handleValidateWorkspace)

  console.log('[IPC] File handlers registered')
}

