import { HashRouter } from 'react-router-dom'
import { useEffect } from 'react'
import AppRouter from './router'
import { useAuthStore } from './stores/authStore'
import './index.css'

/**
 * 应用根组件
 * 集成路由，认证状态初始化
 */
function App(): JSX.Element {
  const { checkAuth } = useAuthStore()

  // 应用启动时检查认证状态
  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  return (
    <HashRouter>
      <AppRouter />
    </HashRouter>
  )
}

export default App
