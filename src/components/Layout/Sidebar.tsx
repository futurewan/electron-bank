import { useLocation, useNavigate } from 'react-router-dom'
import { Layout, Menu } from 'antd'
import { Home, FileSearch, FileText, Settings } from 'lucide-react'
import type { MenuProps } from 'antd'
import styles from './Layout.module.css'

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
                {/* <div className={styles.logoIcon}>💰</div> */}
                {!collapsed && <span className={styles.logoText}>AI 对账助手</span>}
            </div>

            {/* 导航菜单 */}
            <Menu
                theme="dark"
                mode="inline"
                selectedKeys={[location.pathname]}
                items={menuItems}
                onClick={handleMenuClick}
                className={styles.menu}
            />
        </Sider>
    )
}

export default Sidebar
