import { useState } from 'react'
import { Layout as AntLayout } from 'antd'
import Sidebar from './Sidebar'
import Header from './Header'
import styles from './Layout.module.css'

const { Content } = AntLayout

interface LayoutProps {
    children: React.ReactNode
}

/**
 * 应用主布局组件
 * 包含侧边栏、顶部导航和内容区域
 */
function Layout({ children }: LayoutProps): JSX.Element {
    const [collapsed, setCollapsed] = useState(false)

    return (
        <AntLayout className={styles.layout}>
            <Sidebar collapsed={collapsed} />
            <AntLayout>
                <Header collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
                <Content className={styles.content}>
                    {children}
                </Content>
            </AntLayout>
        </AntLayout>
    )
}

export default Layout
