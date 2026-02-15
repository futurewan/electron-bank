import { Route, Routes } from 'react-router-dom'
import Home from '../pages/Home'
import PayerMappings from '../pages/PayerMappings'
import Reconciliation from '../pages/Reconciliation'
import ReconciliationDetail from '../pages/ReconciliationDetail'
import Reports from '../pages/Reports'
import Settings from '../pages/Settings'

/**
 * 应用路由配置
 * 定义所有页面路由
 */
function AppRouter(): JSX.Element {
    return (
        <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/reconciliation" element={<Reconciliation />} />
            <Route path="/reconciliation/:id" element={<ReconciliationDetail />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/payer-mappings" element={<PayerMappings />} />
            <Route path="/settings" element={<Settings />} />
            {/* 后续页面路由在此添加 */}
        </Routes>
    )
}


export default AppRouter
