import { Card, Col, Empty, Input, message, Modal, Row, Space, Spin, Typography } from 'antd'
import { FileSearch, Search } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import FolderConfigModal from '../../components/FolderConfigModal'
import ImportConfirmModal, { FileInfo } from '../../components/ImportConfirmModal'
import { getBankStatementPath, getInvoicePath } from '../../utils/workspacePaths'
import styles from './Reconciliation.module.scss'

const { Title, Text } = Typography

// 获取 electron API
const electron = (window as any).electron

interface BatchInfo {
    id: string
    name: string
    status: string
    totalBankCount: number
    totalInvoiceCount: number
    matchedCount: number
    unmatchedCount: number
    createdAt: string
}

const ReconciliationManagement: React.FC = () => {
    const navigate = useNavigate()
    const [loading, setLoading] = useState(false)
    const [batches, setBatches] = useState<BatchInfo[]>([])
    const [searchText, setSearchText] = useState('')

    // 流程状态
    const [folderConfigVisible, setFolderConfigVisible] = useState(false)
    const [importConfirmVisible, setImportConfirmVisible] = useState(false)
    const [folderConfig, setFolderConfig] = useState<{
        workspaceFolder?: string
    }>({})
    const [scannedFiles, setScannedFiles] = useState<{
        bankFiles: FileInfo[]
        invoiceFiles: FileInfo[]
    }>({ bankFiles: [], invoiceFiles: [] })
    const [pendingBatchName, setPendingBatchName] = useState('')
    const scanningRef = useRef(false) // Prevent double scanning
    const pdfInvoicesRef = useRef<any[]>([]) // 暂存 PDF 解析后的发票数据，用于直接入库

    const location = useLocation()

    const loadBatches = useCallback(async () => {
        setLoading(true)
        try {
            const res = await electron.reconciliation.getAllBatches()
            if (res.success) {
                setBatches(res.batches || [])
            } else {
                message.error('加载批次失败: ' + res.error)
            }
        } catch (error) {
            console.error('加载批次出错:', error)
            message.error('加载批次出错')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadBatches()
    }, [loadBatches])

    const executeBatchCreation = async (name: string, bankFiles: FileInfo[], invoiceFiles: FileInfo[], replaceHistory = false) => {
        setLoading(true)
        try {
            const createRes = await electron.reconciliation.createBatch(name)
            if (!createRes.success) {
                message.error('创建批次失败: ' + createRes.error)
                setLoading(false)
                return
            }

            const batchId = createRes.batchId

            for (const file of bankFiles) {
                await electron.reconciliation.importBankTransactions(batchId, file.path)
            }

            // 根据是否有 PDF 解析数据选择导入路径
            if (pdfInvoicesRef.current.length > 0) {
                // PDF 路径：直接用结构化数据入库（含跨批次去重）
                const importRes = await electron.reconciliation.importPdfInvoices(batchId, pdfInvoicesRef.current)
                if (importRes.skippedDuplicates && importRes.skippedDuplicates.length > 0) {
                    message.warning(`跨批次去重：跳过 ${importRes.skippedDuplicates.length} 张重复发票`)
                }
                pdfInvoicesRef.current = [] // 清空
            } else {
                // Excel 路径：原有导入逻辑
                for (const file of invoiceFiles) {
                    await electron.reconciliation.importInvoices(batchId, file.path)
                }
            }

            setImportConfirmVisible(false)
            setPendingBatchName('')

            navigate(`/reconciliation/${batchId}`, {
                replace: replaceHistory,
                state: {
                    autoImported: true,
                    bankCount: bankFiles.length,
                    bankFiles: bankFiles,
                    invoiceCount: invoiceFiles.length,
                    invoiceFiles: invoiceFiles
                }
            })
        } catch (error) {
            message.error('导入过程出错')
            setLoading(false)
        }
    }

    const checkFolderConfigAndScan = async (autoStart = false, batchName = '') => {
        try {
            const res = await electron.config.getAll()
            if (res.success && res.config) {
                const { workspaceFolder } = res.config

                if (!workspaceFolder) {
                    setFolderConfig({ workspaceFolder })
                    setFolderConfigVisible(true)
                } else {
                    // 验证工作目录
                    const validation = await electron.file.validateWorkspace(workspaceFolder)
                    if (validation.rebuilt) {
                        message.info('工作目录已自动重建，请确保已上传对账数据')
                    }

                    const bankPath = getBankStatementPath(workspaceFolder)
                    const invoicePath = getInvoicePath(workspaceFolder)
                    await scanFolders(bankPath, invoicePath, autoStart, batchName)
                }
            }
        } catch (error) {
            message.error('检查配置失败')
        }
    }

    const scanFolders = async (bankPath: string, invoicePath: string, autoStart = false, batchName = '') => {
        if (scanningRef.current) return
        scanningRef.current = true
        setLoading(true)

        try {
            const [bankRes, invoiceRes] = await Promise.all([
                electron.file.scanFolder(bankPath),
                electron.file.scanFolder(invoicePath)
            ])

            const bankFiles = bankRes.success ? bankRes.files : []
            let invoiceFiles = invoiceRes.success ? invoiceRes.files : []

            console.log('invoiceFiles', invoicePath, invoiceFiles)
            // 如果没有找到 Excel/CSV 发票文件，尝试扫描 PDF
            if (invoiceFiles.length === 0) {
                try {
                    const pdfRes = await electron.reconciliation.scanPdfFolder(invoicePath)
                    if (pdfRes.success && pdfRes.files.length > 0) {
                        message.open({
                            type: 'loading',
                            content: `检测到 ${pdfRes.files.length} 个 PDF 文件，正在智能解析...`,
                            duration: 0,
                            key: 'pdf_parsing'
                        })

                        const exportRes = await electron.reconciliation.exportInvoicesExcel(invoicePath)
                        message.destroy('pdf_parsing')

                        console.log('pdfRes', pdfRes, exportRes)
                        if (exportRes.success) {
                            // 构造去重统计信息
                            const pr = exportRes.parseResult
                            const dedupInfo = pr && pr.duplicateCount > 0
                                ? `，去重跳过 ${pr.duplicateCount} 张`
                                : ''
                            message.success(`PDF 解析完成：成功 ${pr?.successCount || 0} 张${dedupInfo}，已自动生成对账 Excel`)

                            // 保存解析后的发票数据用于直接入库（含跨批次去重）
                            if (exportRes.invoices && exportRes.invoices.length > 0) {
                                pdfInvoicesRef.current = exportRes.invoices
                            }

                            // 重新扫描以获取生成的 Excel 文件
                            const newInvoiceRes = await electron.file.scanFolder(invoicePath)
                            if (newInvoiceRes.success) {
                                invoiceFiles = newInvoiceRes.files
                            }
                        } else {
                            let errorDetails = ''
                            if (exportRes.parseResult && exportRes.parseResult.errors && exportRes.parseResult.errors.length > 0) {
                                const err = exportRes.parseResult.errors[0]
                                const fName = err.filePath.split(/[\\/]/).pop()
                                errorDetails = ` (${fName}: ${err.error})`
                            }
                            message.error('PDF 解析失败: ' + exportRes.error + errorDetails)
                            return
                        }
                    }
                } catch (e) {
                    console.error('PDF 扫描失败', e)
                }
            }

            setScannedFiles({
                bankFiles,
                invoiceFiles
            })

            if (bankFiles.length === 0 || invoiceFiles.length === 0) {
                let msg = ''
                if (bankFiles.length === 0 && invoiceFiles.length === 0) {
                    msg = '银行流水和发票文件夹均为空'
                } else if (bankFiles.length === 0) {
                    msg = '银行流水文件夹为空'
                } else {
                    msg = '发票文件夹为空'
                }

                Modal.confirm({
                    title: '提示',
                    content: `${msg}，是否继续？`,
                    onOk: () => {
                        if (autoStart) {
                            executeBatchCreation(batchName, bankFiles, invoiceFiles, true)
                        } else {
                            setImportConfirmVisible(true)
                        }
                    }
                })
                return
            }

            if (autoStart) {
                await executeBatchCreation(batchName, bankFiles, invoiceFiles, true)
            } else {
                setImportConfirmVisible(true)
            }
        } catch (error) {
            message.error('扫描文件夹出错')
        } finally {
            setLoading(false)
            scanningRef.current = false
        }
    }

    const handleConfigSuccess = async () => {
        setFolderConfigVisible(false)
        const res = await electron.config.getAll()
        if (res.success && res.config && res.config.workspaceFolder) {
            const bankPath = getBankStatementPath(res.config.workspaceFolder)
            const invoicePath = getInvoicePath(res.config.workspaceFolder)
            await scanFolders(bankPath, invoicePath)
        }
    }

    const handleImportConfirm = async () => {
        if (!pendingBatchName) return
        await executeBatchCreation(pendingBatchName, scannedFiles.bankFiles, scannedFiles.invoiceFiles, false)
    }

    const filteredBatches = batches.filter(b =>
        b.name.toLowerCase().includes(searchText.toLowerCase())
    ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // 格式化日期
    const formatDate = (dateStr: string) => {
        try {
            const d = new Date(dateStr)
            return isNaN(d.getTime()) ? dateStr : d.toLocaleString()
        } catch {
            return dateStr
        }
    }

    useEffect(() => {
        const state = location.state as any
        if (state) {
            if (state.autoStart && state.batchName) {
                setPendingBatchName(state.batchName)
                checkFolderConfigAndScan(true, state.batchName)
                window.history.replaceState({}, document.title)
            }
        }
    }, [location])

    return (
        <Spin spinning={loading}>
            <div className={styles.container}>
                <div className={styles.header}>
                    <div className={styles.titleSection}>
                        <FileSearch size={28} color="#6366F1" />
                        <Title level={3} style={{ margin: 0 }}>对账管理</Title>
                    </div>
                    <Space>
                        <Input
                            placeholder="搜索批次名称..."
                            prefix={<Search size={16} color="#94a3b8" />}
                            style={{ width: 250 }}
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                        />
                    </Space>
                </div>

                {filteredBatches.length > 0 ? (
                    <Row gutter={[16, 16]}>
                        {filteredBatches.map(batch => (
                            <Col xs={24} sm={12} md={8} lg={6} key={batch.id}>
                                <Card
                                    className={styles.batchCard}
                                    hoverable
                                    onClick={() => navigate(`/reconciliation/${batch.id}`)}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <Text strong style={{ fontSize: 16 }}>{batch.name}</Text>
                                    </div>
                                    <div className={styles.batchStats}>
                                        <span>银行: {batch.totalBankCount}</span>
                                        <span>发票: {batch.totalInvoiceCount}</span>
                                        <span>匹配: {batch.matchedCount}</span>
                                    </div>
                                    <div className={styles.batchMeta}>
                                        创建于 {formatDate(batch.createdAt)}
                                    </div>
                                </Card>
                            </Col>
                        ))}
                    </Row>
                ) : (
                    <Empty description="暂无对账批次" style={{ marginTop: 100 }} />
                )}
            </div>

            <FolderConfigModal
                open={folderConfigVisible}
                onCancel={() => setFolderConfigVisible(false)}
                onSuccess={handleConfigSuccess}
                config={folderConfig}
            />

            <ImportConfirmModal
                open={importConfirmVisible}
                onCancel={() => setImportConfirmVisible(false)}
                onConfirm={handleImportConfirm}
                bankFiles={scannedFiles.bankFiles}
                invoiceFiles={scannedFiles.invoiceFiles}
                loading={loading}
            />
        </Spin>
    )
}

export default ReconciliationManagement
