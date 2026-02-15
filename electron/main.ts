import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configStore, updateWindowState } from './config/store'
import { closeDatabase } from './database'
import { registerAllIpcHandlers } from './ipc'
import { ensureAppDirs } from './utils/paths'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

/**
 * 从配置恢复窗口状态
 */
function getWindowState() {
  const savedState = configStore.get('window')
  return {
    width: savedState?.width || 1200,
    height: savedState?.height || 800,
    x: savedState?.x,
    y: savedState?.y,
  }
}

/**
 * 保存窗口状态到配置
 */
function saveWindowState() {
  if (!win) return
  
  const bounds = win.getBounds()
  const maximized = win.isMaximized()
  
  updateWindowState({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    maximized,
  })
}

function createWindow() {
  // 获取保存的窗口状态
  const windowState = getWindowState()
  
  win = new BrowserWindow({
    // 窗口尺寸配置（从配置恢复）
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 800,
    minHeight: 600,
    // 窗口行为配置
    show: false, // 先隐藏，加载完成后显示
    center: windowState.x === undefined, // 如果没有保存位置则居中
    autoHideMenuBar: true, // 隐藏菜单栏
    // 窗口样式
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    backgroundColor: '#F8FAFC', // S19 设计系统背景色
    // 标题栏样式（macOS）
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    // Web 偏好设置
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // 如果之前是最大化状态，恢复最大化
  const savedState = configStore.get('window')
  if (savedState?.maximized) {
    win.maximize()
  }

  // 窗口加载完成后显示
  win.on('ready-to-show', () => {
    win?.show()
  })

  // 保存窗口状态
  win.on('close', () => {
    saveWindowState()
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// 应用初始化
app.whenReady().then(() => {
  console.log('[App] Starting...')
  
  // 确保应用目录存在
  ensureAppDirs()
  
  // 注册所有 IPC 处理器
  registerAllIpcHandlers()
  
  // 创建窗口
  createWindow()
  
  console.log('[App] Ready')
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// 应用退出前清理
app.on('before-quit', () => {
  console.log('[App] Cleaning up...')
  
  // 关闭数据库连接
  closeDatabase()
  
  console.log('[App] Cleanup done')
})
