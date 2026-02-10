/**
 * 路由保护组件
 * 未登录用户将被重定向到登录页面
 * @module components/ProtectedRoute
 */

import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'

interface ProtectedRouteProps {
    children: React.ReactNode
}

function ProtectedRoute({ children }: ProtectedRouteProps): JSX.Element {
    const { isLoggedIn } = useAuthStore()
    const location = useLocation()

    // 如果未登录，重定向到登录页，并记录当前位置以便登录后返回
    if (!isLoggedIn) {
        return <Navigate to="/login" state={{ from: location }} replace />
    }

    return <>{children}</>
}

export default ProtectedRoute
