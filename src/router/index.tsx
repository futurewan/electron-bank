import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import ProtectedRoute from '../components/ProtectedRoute'
import Home from '../pages/Home'
import LoginPage from '../pages/Auth/Login'
import RegisterPage from '../pages/Auth/Register'

/**
 * 认证路由保护组件
 * 已登录用户访问登录/注册页时重定向到首页
 */
function AuthRoute({ children }: { children: React.ReactNode }): JSX.Element {
    const { isLoggedIn } = useAuthStore()

    if (isLoggedIn) {
        return <Navigate to="/" replace />
    }

    return <>{children}</>
}

/**
 * 应用路由配置
 * 定义所有页面路由
 */
function AppRouter(): JSX.Element {
    return (
        <Routes>
            {/* 认证路由（未登录可访问） */}
            <Route
                path="/login"
                element={
                    <AuthRoute>
                        <LoginPage />
                    </AuthRoute>
                }
            />
            <Route
                path="/register"
                element={
                    <AuthRoute>
                        <RegisterPage />
                    </AuthRoute>
                }
            />

            {/* 受保护路由（需要登录） */}
            <Route
                path="/"
                element={
                    <ProtectedRoute>
                        <Home />
                    </ProtectedRoute>
                }
            />

            {/* 后续页面路由在此添加 */}
            {/* <Route path="/reconciliation" element={<ProtectedRoute><Reconciliation /></ProtectedRoute>} /> */}
            {/* <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} /> */}
            {/* <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} /> */}

            {/* 404 重定向到首页 */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    )
}

export default AppRouter
