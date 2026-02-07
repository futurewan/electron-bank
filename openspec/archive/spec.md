# Spec: 初始化 Electron + React 项目

## 1. 概述 (Overview)

本规格说明定义了初始化 Electron + React 项目的技术细节，包括配置文件、目录结构和核心代码模板。

---

## 2. 核心配置文件 (Configuration Files)

### 2.1 package.json 关键字段

```json
{
  "name": "electron-bank",
  "version": "0.1.0",
  "description": "AI 对账助手 - 基于 Electron 的桌面应用",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "package": "electron-builder",
    "lint": "eslint . --ext .ts,.tsx",
    "format": "prettier --write \"src/**/*.{ts,tsx,css}\""
  }
}
```

### 2.2 依赖列表

**生产依赖 (dependencies):**
| 包名 | 版本 | 用途 |
|------|------|------|
| react | ^18.2.0 | React 核心库 |
| react-dom | ^18.2.0 | React DOM 渲染 |
| react-router-dom | ^6.20.0 | 客户端路由 |
| antd | ^5.12.0 | UI 组件库 |
| zustand | ^4.4.7 | 状态管理 |
| lucide-react | ^0.300.0 | 图标库 |
| @ant-design/icons | ^5.2.6 | Ant Design 图标 |

**开发依赖 (devDependencies):**
| 包名 | 版本 | 用途 |
|------|------|------|
| electron | ^28.0.0 | Electron 框架 |
| electron-vite | ^2.0.0 | 构建工具 |
| electron-builder | ^24.9.1 | 应用打包 |
| typescript | ^5.3.0 | TypeScript 编译器 |
| tailwindcss | ^3.4.0 | CSS 框架 |
| postcss | ^8.4.32 | CSS 处理器 |
| autoprefixer | ^10.4.16 | CSS 前缀 |
| eslint | ^8.55.0 | 代码检查 |
| prettier | ^3.1.1 | 代码格式化 |

---

## 3. Electron 主进程 (Main Process)

### 3.1 main.ts 规格

```typescript
// electron/main.ts
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 外部链接在浏览器中打开
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 开发环境加载 dev server，生产环境加载打包文件
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

### 3.2 preload.ts 规格

```typescript
// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron'

// 暴露给渲染进程的 API
const electronAPI = {
  // 版本信息
  versions: {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron
  },
  // IPC 通信（预留）
  ipc: {
    send: (channel: string, data: unknown) => {
      ipcRenderer.send(channel, data)
    },
    on: (channel: string, callback: (...args: unknown[]) => void) => {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args))
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
```

---

## 4. 渲染进程 (Renderer Process)

### 4.1 入口文件 main.tsx

```typescript
// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN}>
      <App />
    </ConfigProvider>
  </React.StrictMode>
)
```

### 4.2 根组件 App.tsx

```typescript
// src/App.tsx
import { BrowserRouter } from 'react-router-dom'
import AppRouter from './router'
import Layout from './components/Layout'

function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Layout>
        <AppRouter />
      </Layout>
    </BrowserRouter>
  )
}

export default App
```

### 4.3 路由配置 router/index.tsx

```typescript
// src/router/index.tsx
import { Routes, Route } from 'react-router-dom'
import Home from '../pages/Home'

function AppRouter(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      {/* 后续页面在此添加 */}
    </Routes>
  )
}

export default AppRouter
```

---

## 5. 布局组件 (Layout Component)

### 5.1 Layout/index.tsx

```typescript
// src/components/Layout/index.tsx
import { Layout as AntLayout } from 'antd'
import Sidebar from './Sidebar'
import Header from './Header'
import styles from './Layout.module.css'

const { Content } = AntLayout

interface LayoutProps {
  children: React.ReactNode
}

function Layout({ children }: LayoutProps): JSX.Element {
  return (
    <AntLayout className={styles.layout}>
      <Sidebar />
      <AntLayout>
        <Header />
        <Content className={styles.content}>
          {children}
        </Content>
      </AntLayout>
    </AntLayout>
  )
}

export default Layout
```

### 5.2 Sidebar 规格

- 宽度：220px（收起时 80px）
- 背景色：深色主题 (#001529)
- 菜单项：
  - 首页 (Home)
  - 对账管理 (Reconciliation)
  - 报告中心 (Reports)
  - 设置 (Settings)

### 5.3 Header 规格

- 高度：64px
- 内容：应用标题、用户头像、通知图标
- 样式：白色背景，底部阴影

---

## 6. 样式配置 (Styling)

### 6.1 tailwind.config.js

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#1890ff',
        success: '#52c41a',
        warning: '#faad14',
        error: '#ff4d4f'
      }
    }
  },
  plugins: [],
  // 避免与 Ant Design 冲突
  corePlugins: {
    preflight: false
  }
}
```

### 6.2 src/styles/index.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* 全局样式重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #root {
  height: 100%;
}

/* Ant Design 主题覆盖 */
:root {
  --primary-color: #1890ff;
}
```

---

## 7. 类型定义 (Type Definitions)

### 7.1 src/types/electron.d.ts

```typescript
// 声明 window.electronAPI 类型
interface ElectronAPI {
  versions: {
    node: () => string
    chrome: () => string
    electron: () => string
  }
  ipc: {
    send: (channel: string, data: unknown) => void
    on: (channel: string, callback: (...args: unknown[]) => void) => void
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
```

---

## 8. 打包配置 (Build Configuration)

### 8.1 electron-builder.yml

```yaml
appId: com.electron.bank
productName: AI对账助手
directories:
  buildResources: build
files:
  - '!**/.vscode/*'
  - '!src/*'
  - '!electron/*'
  - '!{.eslintrc,.prettierrc,tsconfig.*}'
  - '!{*.md}'
asarUnpack:
  - resources/**
win:
  executableName: ai-reconciliation
  target:
    - nsis
nsis:
  artifactName: ${name}-${version}-setup.${ext}
  shortcutName: ${productName}
  uninstallDisplayName: ${productName}
  createDesktopShortcut: always
mac:
  entitlementsInherit: build/entitlements.mac.plist
  target:
    - dmg
    - zip
  artifactName: ${name}-${version}.${ext}
linux:
  target:
    - AppImage
    - deb
  maintainer: electronbank
  category: Office
```

---

**文档状态**: ✅ 已完成

**关联文档**: 
- [proposal.md](./proposal.md) - 项目提案
- [tasks.md](./tasks.md) - 任务清单
