import { Layout, Button, Avatar, Badge, Dropdown } from 'antd'
import { Menu, Bell, User, LogOut, Settings } from 'lucide-react'
import type { MenuProps } from 'antd'
import styles from './Layout.module.css'

const { Header: AntHeader } = Layout

interface HeaderProps {
    collapsed: boolean
    onToggle: () => void
}

// 用户下拉菜单
const userMenuItems: MenuProps['items'] = [
    {
        key: 'profile',
        icon: <User size={16} />,
        label: '个人信息',
    },
    {
        key: 'settings',
        icon: <Settings size={16} />,
        label: '账户设置',
    },
    {
        type: 'divider',
    },
    {
        key: 'logout',
        icon: <LogOut size={16} />,
        label: '退出登录',
        danger: true,
    },
]

/**
 * 顶部导航栏组件
 * 整个导航栏可拖动，按钮等交互元素可点击
 */
function Header({ collapsed: _collapsed, onToggle }: HeaderProps): JSX.Element {
    return (
        <AntHeader className={styles.header}>
            {/* 左侧：菜单切换按钮 */}
            <div className={styles.headerLeft}>
                <Button
                    type="text"
                    icon={<Menu size={20} />}
                    onClick={onToggle}
                    className={styles.menuToggle}
                />
                <h1 className={styles.pageTitle}>AI 对账助手</h1>
            </div>

            {/* 右侧：通知和用户 */}
            <div className={styles.headerRight}>
                {/* 通知图标 */}
                <Badge count={3} size="small">
                    <Button
                        type="text"
                        icon={<Bell size={20} />}
                        className={styles.iconButton}
                    />
                </Badge>

                {/* 用户头像下拉菜单 */}
                <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
                    <div className={styles.userAvatar}>
                        <Avatar
                            size={36}
                            style={{
                                background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
                                cursor: 'pointer'
                            }}
                        >
                            管
                        </Avatar>
                    </div>
                </Dropdown>
            </div>
        </AntHeader>
    )
}

export default Header

