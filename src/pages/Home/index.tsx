import { Card, Row, Col, Statistic, Button, Typography } from 'antd'
import { FileSearch, FileCheck, AlertTriangle, TrendingUp, Plus, Upload } from 'lucide-react'
import styles from './Home.module.css'

const { Title, Paragraph } = Typography

/**
 * 首页组件
 * 展示数据概览、快捷操作和系统状态
 */
function Home(): JSX.Element {
    // 模拟统计数据
    const stats = [
        {
            title: '待对账',
            value: 12,
            icon: <FileSearch size={24} />,
            color: '#6366F1',
            bgColor: 'rgba(99, 102, 241, 0.1)',
        },
        {
            title: '已完成',
            value: 156,
            icon: <FileCheck size={24} />,
            color: '#10B981',
            bgColor: 'rgba(16, 185, 129, 0.1)',
        },
        {
            title: '异常项',
            value: 3,
            icon: <AlertTriangle size={24} />,
            color: '#F59E0B',
            bgColor: 'rgba(245, 158, 11, 0.1)',
        },
        {
            title: '匹配率',
            value: 98.5,
            suffix: '%',
            icon: <TrendingUp size={24} />,
            color: '#8B5CF6',
            bgColor: 'rgba(139, 92, 246, 0.1)',
        },
    ]

    return (
        <div className={styles.home}>
            {/* 欢迎区域 */}
            <section className={styles.welcome}>
                <div className={styles.welcomeContent}>
                    <Title level={2} className={styles.welcomeTitle}>
                        👋 欢迎使用 AI 对账助手
                    </Title>
                    <Paragraph className={styles.welcomeDesc}>
                        智能对账，轻松管理。支持自动对账、生成对账单、生成对账报告。
                    </Paragraph>
                </div>
                <div className={styles.welcomeActions}>
                    <Button
                        type="primary"
                        size="large"
                        icon={<Plus size={18} />}
                        className={styles.primaryBtn}
                    >
                        新建对账
                    </Button>
                    <Button
                        size="large"
                        icon={<Upload size={18} />}
                    >
                        导入数据
                    </Button>
                </div>
            </section>

            {/* 数据统计卡片 */}
            <section className={styles.statsSection}>
                <Row gutter={[24, 24]}>
                    {stats.map((stat, index) => (
                        <Col xs={12} sm={12} md={6} key={index}>
                            <Card className={styles.statsCard} bordered={false}>
                                <div className={styles.statsIcon} style={{ background: stat.bgColor, color: stat.color }}>
                                    {stat.icon}
                                </div>
                                <Statistic
                                    title={stat.title}
                                    value={stat.value}
                                    suffix={stat.suffix}
                                    valueStyle={{ color: stat.color }}
                                />
                            </Card>
                        </Col>
                    ))}
                </Row>
            </section>

            {/* 快捷操作区域 */}
            <section className={styles.quickActions}>
                <Title level={4}>快捷操作</Title>
                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12} md={8}>
                        <Card hoverable className={styles.actionCard}>
                            <div className={styles.actionIcon}>📤</div>
                            <div className={styles.actionContent}>
                                <Title level={5}>导入账单</Title>
                                <Paragraph type="secondary">支持 Excel、CSV 格式</Paragraph>
                            </div>
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} md={8}>
                        <Card hoverable className={styles.actionCard}>
                            <div className={styles.actionIcon}>🔍</div>
                            <div className={styles.actionContent}>
                                <Title level={5}>智能对账</Title>
                                <Paragraph type="secondary">AI 自动匹配账目</Paragraph>
                            </div>
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} md={8}>
                        <Card hoverable className={styles.actionCard}>
                            <div className={styles.actionIcon}>📊</div>
                            <div className={styles.actionContent}>
                                <Title level={5}>生成报告</Title>
                                <Paragraph type="secondary">导出对账分析报告</Paragraph>
                            </div>
                        </Card>
                    </Col>
                </Row>
            </section>
        </div>
    )
}

export default Home
