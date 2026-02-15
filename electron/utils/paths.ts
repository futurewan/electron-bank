/**
 * 路径工具
 * 统一管理应用的各种路径
 */
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 应用目录枚举
 */
export enum AppDir {
  Database = 'database',
  Config = 'config',
  Imports = 'imports',
  Exports = 'exports',
  Logs = 'logs',
  Temp = 'temp',
}

/**
 * 获取应用数据根目录
 * macOS: ~/Library/Application Support/electron-bank
 * Windows: %APPDATA%/electron-bank
 * Linux: ~/.config/electron-bank
 */
export function getAppDataPath(): string {
  return app.getPath('userData')
}

/**
 * 获取指定子目录路径
 */
export function getAppDirPath(dir: AppDir): string {
  return path.join(getAppDataPath(), dir)
}

/**
 * 确保目录存在
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

/**
 * 确保所有应用目录存在
 */
export function ensureAppDirs(): void {
  Object.values(AppDir).forEach((dir) => {
    ensureDir(getAppDirPath(dir))
  })
}

/**
 * 获取文件路径（相对于指定目录）
 */
export function getFilePath(dir: AppDir, filename: string): string {
  return path.join(getAppDirPath(dir), filename)
}

/**
 * 获取带日期的子目录路径
 * 例如：imports/2024-01/
 */
export function getDatedDirPath(dir: AppDir, date?: Date): string {
  const d = date || new Date()
  const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  return path.join(getAppDirPath(dir), yearMonth)
}

/**
 * 生成唯一文件名
 */
export function generateUniqueFilename(originalName: string): string {
  const ext = path.extname(originalName)
  const base = path.basename(originalName, ext)
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `${base}_${timestamp}_${random}${ext}`
}

/**
 * 获取用户桌面路径
 */
export function getDesktopPath(): string {
  return app.getPath('desktop')
}

/**
 * 获取用户文档路径
 */
export function getDocumentsPath(): string {
  return app.getPath('documents')
}
