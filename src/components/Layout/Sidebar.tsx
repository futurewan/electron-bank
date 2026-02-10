import { useLocation, useNavigate } from 'react-router-dom'
import { Layout, Menu, Avatar, Tooltip } from 'antd'
import { Home, FileSearch, FileText, Settings, LogOut } from 'lucide-react'
import type { MenuProps } from 'antd'
import { useAuthStore } from '../../stores/authStore'
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
 * 深色主题，包含导航菜单和底部用户区域
 */
function Sidebar({ collapsed }: SidebarProps): JSX.Element {
    const location = useLocation()
    const navigate = useNavigate()
    const { user, logout } = useAuthStore()

    const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
        navigate(key)
    }

    const handleLogout = () => {
        logout()
        navigate('/login', { replace: true })
    }

    // 获取用户名首字符
    const getAvatarText = (): string => {
        if (!user?.username) return '?'
        return user.username.charAt(0).toUpperCase()
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
                {collapsed && <span className={styles.logoIcon}>💰</span>}
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

            {/* 底部用户区域 */}
            <div className={styles.sidebarFooter}>
                <div className={styles.userSection}>
                    <Avatar
                        size={collapsed ? 32 : 36}
                        src={user?.avatar}
                        style={{
                            background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
                            flexShrink: 0,
                        }}
                    >
                        {getAvatarText()}
                    </Avatar>
                    {!collapsed && (
                        <div className={styles.userDetails}>
                            <span className={styles.userName}>{user?.username || '用户'}</span>
                            <span className={styles.userStatus}>在线</span>
                        </div>
                    )}
                </div>

                {/* 退出按钮 */}
                <Tooltip title="退出登录" placement="right">
                    <button
                        className={styles.logoutButton}
                        onClick={handleLogout}
                        aria-label="退出登录"
                    >
                        <LogOut size={18} />
                    </button>
                </Tooltip>
            </div>
        </Sider>
    )
}

export default Sidebar
