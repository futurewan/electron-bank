/**
 * 用户信息组件
 * 显示在 Header 右侧，参考百度网盘 "Hi >" 风格
 * @module components/UserInfo
 */

import { Avatar, Dropdown, message } from 'antd'
import { User, Settings, LogOut, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { MenuProps } from 'antd'
import { useAuthStore } from '../../stores/authStore'
import styles from './UserInfo.module.css'

function UserInfo(): JSX.Element {
    const navigate = useNavigate()
    const [messageApi, contextHolder] = message.useMessage()
    const { user, logout } = useAuthStore()

    // 处理菜单点击
    const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
        switch (key) {
            case 'profile':
                messageApi.info('个人信息功能开发中...')
                break
            case 'settings':
                messageApi.info('账户设置功能开发中...')
                break
            case 'logout':
                logout()
                messageApi.success('已退出登录')
                setTimeout(() => {
                    navigate('/login', { replace: true })
                }, 500)
                break
        }
    }

    // 下拉菜单项
    const menuItems: MenuProps['items'] = [
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

    // 获取用户名首字符用于头像
    const getAvatarText = (): string => {
        if (!user?.username) return '?'
        return user.username.charAt(0).toUpperCase()
    }

    return (
        <>
            {contextHolder}
            <Dropdown
                menu={{ items: menuItems, onClick: handleMenuClick }}
                placement="bottomRight"
                trigger={['click']}
            >
                <div className={styles.userInfo}>
                    <Avatar
                        size={32}
                        src={user?.avatar}
                        style={{
                            background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
                            cursor: 'pointer',
                        }}
                    >
                        {getAvatarText()}
                    </Avatar>
                    <span className={styles.greeting}>Hi</span>
                    <ChevronRight size={14} className={styles.arrow} />
                </div>
            </Dropdown>
        </>
    )
}

export default UserInfo
