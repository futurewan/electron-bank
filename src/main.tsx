import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './index.css'

// Ant Design 主题配置 - 基于 S19 Aesthetic Harmony
const theme = {
  token: {
    // 品牌色
    colorPrimary: '#6366F1',
    colorSuccess: '#10B981',
    colorWarning: '#F59E0B',
    colorError: '#EF4444',
    colorInfo: '#6366F1',

    // 文本色
    colorText: '#1E293B',
    colorTextSecondary: '#475569',
    colorTextTertiary: '#94A3B8',

    // 边框
    colorBorder: '#E2E8F0',
    colorBorderSecondary: '#F1F5F9',

    // 背景
    colorBgContainer: '#FFFFFF',
    colorBgLayout: '#F8FAFC',
    colorBgElevated: '#FFFFFF',

    // 圆角
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,

    // 字体
    fontFamily: "'Inter', 'SF Pro Display', system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontSize: 14,

    // 动画
    motionDurationFast: '200ms',
    motionDurationMid: '300ms',
    motionDurationSlow: '400ms',
  },
  components: {
    Button: {
      primaryShadow: '0 4px 16px rgba(99,102,241,0.2)',
    },
    Card: {
      borderRadiusLG: 16,
    },
    Layout: {
      siderBg: '#001529',
      headerBg: '#FFFFFF',
    },
  },
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={theme}>
      <App />
    </ConfigProvider>
  </React.StrictMode>
)

// Electron IPC 消息监听
window.ipcRenderer?.on('main-process-message', (_event, message) => {
  console.log(message)
})
