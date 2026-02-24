import { Alert, Button, Card, Col, message, Modal, Row, Spin, Typography } from 'antd'
import { CheckCircle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FolderConfigModal from '../../components/FolderConfigModal'
import styles from './Home.module.scss'

const { Title, Paragraph } = Typography

// 获取 electron API
const electron = (window as any).electron

// 检查是否运行在 Electron 环境
const isElectron = !!electron?.reconciliation

/**
 * 首页组件
 * 展示欢迎信息和已完成任务列表
 */
function Home(): JSX.Element {
    const navigate = useNavigate()

    // 状态
    const [loading, setLoading] = useState(false)
    const [settingsModalVisible, setSettingsModalVisible] = useState(false)
    const [folderConfig, setFolderConfig] = useState({})
    const [completedBatches, setCompletedBatches] = useState<any[]>([])

    // 加载已完成批次
    const loadBatches = useCallback(async () => {
        if (!isElectron) {
            console.log('[Home] 非 Electron 环境，跳过加载批次')
            return
        }

        try {
            const result = await electron.reconciliation.getAllBatches()
            if (result.success) {
                // 只保留已完成 / 已归档的批次
                const completed = (result.batches || []).filter(
                    (b: any) => b.status === 'completed' || b.status === 'archived' || b.status === 'unbalanced'
                )
                setCompletedBatches(completed)
            }
        } catch (error) {
            console.error('加载批次失败:', error)
        }
    }, [])

    useEffect(() => {
        loadBatches()
    }, [loadBatches])

    // 开始对账
    const handleStartReconciliation = async () => {
        if (!isElectron) {
            message.error('此功能仅在 Electron 应用中可用，请使用桌面应用')
            return
        }

        try {
            setLoading(true)
            // 检查工作目录配置
            const res = await electron.config.getAll()
            const config = res.config || {}

            if (!config.workspaceFolder) {
                setFolderConfig(config)
                setSettingsModalVisible(true)
                return
            }

            // 验证工作目录
            const validation = await electron.file.validateWorkspace(config.workspaceFolder)
            if (validation.rebuilt) {
                message.info('工作目录已自动重建，请确保已上传对账数据到相应文件夹')
            }

            // 检查 AI 模型配置
            const aiRes = await electron.ai.getConfig()
            const hasApiKey = aiRes.success && aiRes.config && aiRes.config.hasApiKey

            const startReconciliation = async () => {
                // 自动生成批次名称：日期+对账
                const date = new Date()
                const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                const baseName = `${dateStr}对账`

                let finalName = baseName
                let counter = 2

                // 检查重名
                const allResult = await electron.reconciliation.getAllBatches()
                const existingNames = new Set((allResult.batches || []).map((b: any) => b.name))
                while (existingNames.has(finalName)) {
                    finalName = `${baseName}-${counter}`
                    counter++
                }

                navigate('/reconciliation', { state: { autoStart: true, batchName: finalName } })
            }

            if (!hasApiKey) {
                setLoading(false)
                Modal.confirm({
                    title: 'AI 模型未配置',
                    content: '检测到您尚未配置 AI 模型的 API Key。这可能会导致 PDF 解析和智能对账功能受限。是否继续对账？',
                    okText: '继续对账',
                    cancelText: '去配置',
                    onOk: () => {
                        setLoading(true)
                        startReconciliation().finally(() => setLoading(false))
                    },
                    onCancel: () => {
                        navigate('/settings')
                    }
                })
            } else {
                await startReconciliation()
            }
        } catch (error) {
            console.error('检查配置失败:', error)
            message.error('检查系统配置失败')
        } finally {
            setLoading(false)
        }
    }

    // 格式化日期
    const formatDate = (date: any) => {
        if (!date) return '-'
        try {
            const d = new Date(date)
            return isNaN(d.getTime()) ? '-' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        } catch {
            return '-'
        }
    }

    return (
        <Spin spinning={loading} tip="处理中...">
            <div className={styles.home}>
                {/* 浏览器环境提示 */}
                {!isElectron && (
                    <Alert
                        message="浏览器模式"
                        description="当前在浏览器中运行，功能受限。请使用 Electron 桌面应用以获得完整功能。"
                        type="warning"
                        showIcon
                        style={{ marginBottom: 16 }}
                    />
                )}

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
                            className={styles.primaryBtn}
                            onClick={handleStartReconciliation}
                            style={{
                                fontSize: '18px',
                                height: '56px',
                                padding: '0 48px',
                                borderRadius: '12px',
                            }}
                        >
                            开始对账
                        </Button>
                    </div>
                </section>

                {/* 已完成任务列表 */}
                {completedBatches.length > 0 && (
                    <section className={styles.quickActions}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <Title level={4} style={{ margin: 0 }}>已完成任务</Title>
                            <Button type="link" onClick={() => navigate('/reconciliation')}>查看全部对账管理</Button>
                        </div>
                        <Row gutter={[16, 16]}>
                            {completedBatches.slice(0, 6).map((batch) => (
                                <Col xs={24} sm={12} md={8} key={batch.id}>
                                    <Card
                                        size="small"
                                        hoverable
                                        onClick={() => navigate(`/reconciliation/${batch.id}`)}
                                        style={{ borderColor: '#e5e7eb', borderRadius: 12 }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 500 }}>{batch.name}</span>
                                            <CheckCircle size={16} color="#10B981" />
                                        </div>
                                        <div style={{ marginTop: 8, color: '#64748b', fontSize: 12 }}>
                                            {formatDate(batch.completedAt || batch.createdAt)} · 匹配: {batch.matchedCount || 0} · 异常: {batch.exceptionCount || 0}
                                        </div>
                                    </Card>
                                </Col>
                            ))}
                        </Row>
                    </section>
                )}
            </div>

            {/* 工作目录配置弹窗 */}
            <FolderConfigModal
                open={settingsModalVisible}
                onCancel={() => setSettingsModalVisible(false)}
                onSuccess={() => {
                    setSettingsModalVisible(false)
                    handleStartReconciliation()
                }}
                config={folderConfig}
            />
        </Spin>
    )
}

export default Home
