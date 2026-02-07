import { Routes, Route } from 'react-router-dom'
import Home from '../pages/Home'

/**
 * 应用路由配置
 * 定义所有页面路由
 */
function AppRouter(): JSX.Element {
    return (
        <Routes>
            <Route path="/" element={<Home />} />
            {/* 后续页面路由在此添加 */}
            {/* <Route path="/reconciliation" element={<Reconciliation />} /> */}
            {/* <Route path="/reports" element={<Reports />} /> */}
            {/* <Route path="/settings" element={<Settings />} /> */}
        </Routes>
    )
}

export default AppRouter
