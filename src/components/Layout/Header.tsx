import { Layout, Button, Badge } from 'antd'
import { Menu, Bell } from 'lucide-react'
import UserInfo from '../UserInfo'
import styles from './Layout.module.css'

const { Header: AntHeader } = Layout

interface HeaderProps {
    collapsed: boolean
    onToggle: () => void
}

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

                {/* 用户信息组件 */}
                <UserInfo />
            </div>
        </AntHeader>
    )
}

export default Header
