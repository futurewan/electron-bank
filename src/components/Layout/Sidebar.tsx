import type { MenuProps } from 'antd'
import { Layout, Menu } from 'antd'
import { FileSearch, FileText, Home, Settings, Users } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import styles from './Layout.module.scss'

const { Sider } = Layout

interface SidebarProps {
    collapsed: boolean
}

// 菜单项配置
const menuItems: MenuProps['items'] = [
    {
        key: '/',
        icon: <Home size={18} />,
        label: '首页',
    },
    {
        key: '/reconciliation',
        icon: <FileSearch size={18} />,
        label: '对账管理',
    },
    {
        key: '/payer-mappings',
        icon: <Users size={18} />,
        label: '映射管理',
    },
    {
        key: '/reports',
        icon: <FileText size={18} />,
        label: '报告中心',
    },
    {
        key: '/settings',
        icon: <Settings size={18} />,
        label: '设置',
    },
]

/**
 * 侧边栏组件
 * 深色主题，包含导航菜单
 */
function Sidebar({ collapsed }: SidebarProps): JSX.Element {
    const location = useLocation()
    const navigate = useNavigate()

    const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
        navigate(key)
    }

    // 计算当前应该高亮的菜单项
    const getSelectedKey = () => {
        const path = location.pathname
        if (path === '/') return '/'
        if (path.startsWith('/reconciliation')) return '/reconciliation'
        if (path.startsWith('/payer-mappings')) return '/payer-mappings'
        if (path.startsWith('/reports')) return '/reports'
        if (path.startsWith('/settings')) return '/settings'
        return path
    }

    return (
        <Sider
            trigger={null}
            collapsible
            collapsed={collapsed}
            className={styles.sidebar}
            width={220}
            collapsedWidth={80}
        >
            {/* Logo 区域 */}
            <div className={styles.logo}>
                {!collapsed && <span className={styles.logoText}>AI 对账助手</span>}
            </div>

            {/* 导航菜单 */}
            <Menu
                theme="dark"
                mode="inline"
                selectedKeys={[getSelectedKey()]}
                items={menuItems}
                onClick={handleMenuClick}
                className={styles.menu}
            />
        </Sider>
    )
}

export default Sidebar
