import { ArrowLeftOutlined, CheckCircleOutlined, DownloadOutlined, SyncOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, List, message, Modal, Progress, Row, Space, Spin, Statistic, Table, Tag, Typography } from 'antd'
import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { FileInfo } from '../../components/ImportConfirmModal'
import MappingReminderModal, { AggregatedProxyPayment, NewMappingInput } from '../../components/MappingReminderModal'

const { Title, Paragraph, Text } = Typography

// 获取 electron API
const electron = (window as any).electron
const isElectron = !!electron?.reconciliation

interface BatchInfo {
  id: string
  name: string
  status: string
  createdAt: string
  completedAt?: string
  totalBankCount: number
  totalInvoiceCount: number
  matchedCount: number
  unmatchedCount: number
}

interface MatchingStats {
  perfectCount: number
  toleranceCount: number
  proxyCount: number
  aiCount: number
  remainingBankCount: number
  remainingInvoiceCount: number
}

interface ExceptionItem {
  id: string
  type: string
  severity: 'high' | 'medium' | 'low'
  suggestion: string
  status: string
  detail?: any
}

interface ReportInfo {
  id: string
  name: string
  filePath: string
  type: string
  createdAt: string
}

const ReconciliationDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [showAutoImportAlert, setShowAutoImportAlert] = useState(false)
  const [sourceFiles, setSourceFiles] = useState<{
    bankFiles: FileInfo[]
    invoiceFiles: FileInfo[]
  } | null>(null)

  const [loading, setLoading] = useState(false)
  const [batch, setBatch] = useState<BatchInfo | null>(null)
  const [stats, setStats] = useState<MatchingStats | null>(null)

  // 进度状态
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<{
    stage: string
    percentage: number
    message: string
  }>({ stage: '', percentage: 0, message: '' })

  // 异常数据
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([])
  const [exceptionPageSize, setExceptionPageSize] = useState(5)

  // 详情弹窗
  const [detailsModalVisible, setDetailsModalVisible] = useState(false)
  const [detailsType, setDetailsType] = useState<string>('')
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsData, setDetailsData] = useState<any[]>([])

  // 代付检测弹窗
  const [proxyModalVisible, setProxyModalVisible] = useState(false)
  const [proxyPayments, setProxyPayments] = useState<AggregatedProxyPayment[]>([])
  const [sellerSuggestions, setSellerSuggestions] = useState<string[]>([])


  // 报告数据
  const [reportList, setReportList] = useState<ReportInfo[]>([])

  const handleShowDetails = async (type: string) => {
    if (!id) return
    setDetailsType(type)
    setDetailsModalVisible(true)
    setDetailsLoading(true)
    try {
      const res = await electron.reconciliation.getMatchResults(id, type)
      if (res.success) {
        setDetailsData(res.results || [])
      }
    } catch (e) {
      message.error('加载详情失败')
    } finally {
      setDetailsLoading(false)
    }
  }

  // 加载数据
  const loadData = async () => {
    if (!isElectron || !id) return

    setLoading(true)
    try {
      // 获取批次详情
      const batchRes = await electron.reconciliation.getBatch(id)
      if (batchRes.success) {
        setBatch(batchRes.batch)
      } else {
        message.error('加载批次失败: ' + batchRes.error)
        return
      }

      // 获取预览数据（包含统计和异常）
      const previewRes = await electron.reconciliation.getReportPreview(id)
      if (previewRes.success) {
        setStats(previewRes.preview.stats)

        // 获取异常列表
        const excRes = await electron.reconciliation.getExceptions(id)
        if (excRes.success) {
          setExceptions(excRes.exceptions || [])
        }

        // 获取已生成的报告列表
        const reportRes = await electron.reconciliation.getBatchReports(id)
        if (reportRes.success) {
          setReportList(reportRes.reports || [])
        }
      }
    } catch (error) {
      console.error('加载数据出错:', error)
      message.error('加载数据出错')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    if ((location.state as any)?.autoImported) {
      setShowAutoImportAlert(true)
    }

    // 获取传递的文件信息
    const state = location.state as any
    if (state?.bankFiles || state?.invoiceFiles) {
      setSourceFiles({
        bankFiles: state.bankFiles || [],
        invoiceFiles: state.invoiceFiles || []
      })
    }

    // Clear state to prevent reappearance on refresh
    if ((location.state as any)?.autoImported) {
      window.history.replaceState({ ...window.history.state, state: {} }, document.title)
    }

    if (isElectron) {
      const cleanup = electron.reconciliation.onProgress((data: any) => {
        console.log('Progress:', data)

        const percentage = data.percentage !== undefined
          ? data.percentage
          : (data.total > 0 ? Math.floor((data.current / data.total) * 100) : 0)

        if (data.type === 'reconciliation_process') {
          setProcessing(true)
        }

        setProgress({
          stage: data.stage,
          percentage: percentage,
          message: data.message,
        })

        if (data.stats) {
          setStats(data.stats)
        }

        if (percentage === 100 || data.stage === 'done' || data.stage === 'completed') {
          if (data.type === 'reconciliation_process') {
            setProcessing(false)
            message.success('核销任务完成')
            loadData()
          }
        }
      })

      return () => {
        cleanup && cleanup()
      }
    }
  }, [id])

  // 开始匹配
  const handleStartMatching = async () => {
    if (!processing && id) {
      try {
        const detectRes = await electron.reconciliation.detectProxyPayments(id)
        if (detectRes.success && detectRes.proxyPayments && detectRes.proxyPayments.length > 0) {
          const suggestRes = await electron.reconciliation.getSellerSuggestions(id)
          setSellerSuggestions(suggestRes.suggestions || [])
          setProxyPayments(detectRes.proxyPayments)
          setProxyModalVisible(true)
          return
        }
        startReconciliationProcess()
      } catch (error) {
        console.error('代付检测失败:', error)
        startReconciliationProcess()
      }
    }
  }

  const startReconciliationProcess = async () => {
    if (!id) return
    setProxyModalVisible(false)
    setProcessing(true)
    setProgress({ stage: 'rule_matching', percentage: 0, message: '初始化对账流程...' })
    try {
      const res = await electron.reconciliation.executeRuleMatching(id)
      if (!res.success) {
        if (res.error === 'Error: 任务被用户停止' || res.error?.includes('停止')) {
          message.warning('对账已手动停止')
        } else {
          message.error('启动失败: ' + res.error)
        }
        setProcessing(false)
        loadData()
      }
    } catch (error) {
      setProcessing(false)
      message.error('启动出错')
      loadData()
    }
  }

  const handleAddMappings = async (mappings: NewMappingInput[]) => {
    const res = await electron.reconciliation.batchAddMappings(mappings)
    if (!res.success) {
      throw new Error(res.error || '添加失败')
    }
    setProxyModalVisible(false)
    startReconciliationProcess()
  }

  const handleSkipProxyDetection = () => {
    setProxyModalVisible(false)
    startReconciliationProcess()
  }

  const handleStop = async () => {
    if (!id) return
    try {
      await electron.reconciliation.stopReconciliation(id)
      message.loading('正在停止核销任务...', 1)
    } catch (error) {
      console.error('停止失败:', error)
      message.error('请求停止失败')
    }
  }

  // 下载/显示报告
  const handleOpenReport = (filePath: string) => {
    try {
      electron.app.showInFolder(filePath)
    } catch (error) {
      message.error('无法打开报告文件')
    }
  }

  // 解决异常
  const handleResolveException = async (excId: string, resolution: string) => {
    try {
      await electron.reconciliation.resolveException(excId, resolution)
      message.success('已更新异常状态')
      loadData()
    } catch (error) {
      message.error('操作失败')
    }
  }

  const renderExceptionType = (type: string) => {
    const map: Record<string, string> = {
      'NO_INVOICE': '有水无票',
      'NO_BANK_TXN': '有票无水',
      'DUPLICATE_PAYMENT': '重复支付',
      'AMOUNT_MISMATCH': '金额不符',
      'SUSPICIOUS_PROXY': '可疑代付',
    }
    return <Tag color="orange">{map[type] || type}</Tag>
  }

  const renderSeverity = (severity: string) => {
    const map: Record<string, { text: string; color: string }> = {
      'high': { text: '高危', color: 'red' },
      'medium': { text: '中危', color: 'orange' },
      'low': { text: '低危', color: 'gold' },
    }
    const config = map[severity] || { text: severity, color: 'default' }
    return <Tag color={config.color}>{config.text}</Tag>
  }

  const getMatchTypeName = (type: string) => {
    switch (type) {
      case 'perfect': return '完美匹配'
      case 'tolerance': return '容差匹配'
      case 'proxy': return '代付匹配'
      case 'ai': return 'AI 匹配'
      default: return '匹配详情'
    }
  }

  // 计算简化统计
  const perfectMatchCount = (stats?.perfectCount || 0)
  const explainableCount = (stats?.toleranceCount || 0) + (stats?.proxyCount || 0) + (stats?.aiCount || 0)
  const exceptionCount = exceptions.length

  // 解析异常详情
  const parseExceptionDetail = (detail: string | undefined): string => {
    if (!detail) return ''
    try {
      const parsed = JSON.parse(detail)
      if (parsed.payerName) {
        return `${parsed.payerName} ¥${parsed.amount || ''}`
      } else if (parsed.currentTx) {
        return `${parsed.currentTx.payer || ''} ¥${parsed.currentTx.amount || ''}`
      }
      return ''
    } catch {
      return detail
    }
  }

  return (
    <Spin spinning={loading}>
      <div style={{ padding: 24 }}>
        {/* 头部 */}
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>返回</Button>
            <Title level={3} style={{ margin: 0 }}>
              {batch?.name || '对账详情'}
            </Title>
          </Space>

          <Space>
            <Button
              type="primary"
              icon={processing ? <SyncOutlined spin /> : <CheckCircleOutlined />}
              onClick={handleStartMatching}
              disabled={processing || batch?.status === 'completed'}
            >
              {processing ? progress.percentage + '%' : '开始对账'}
            </Button>
            {processing && (
              <Button
                danger
                icon={<SyncOutlined />}
                onClick={handleStop}
              >
                停止
              </Button>
            )}
          </Space>
        </div>


        {/* 智能导入提示 */}
        {showAutoImportAlert && (
          <Alert
            message="智能对账已启动"
            description="系统已自动扫描并导入银行流水与发票文件，无需手动确认，正在进行智能匹配。"
            type="success"
            showIcon
            closable
            onClose={() => setShowAutoImportAlert(false)}
            style={{ marginBottom: 24 }}
          />
        )}

        {/* 进度条 */}
        {processing && (
          <Card style={{ marginBottom: 24 }}>
            <Paragraph>{progress.message}</Paragraph>
            <Progress percent={progress.percentage} status="active" />
          </Card>
        )}

        {/* 简化统计卡片：3 个核心指标 */}
        <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
          <Col span={8}>
            <Card hoverable onClick={() => handleShowDetails('perfect')} style={{ cursor: 'pointer', borderLeft: '4px solid #52c41a' }}>
              <Statistic
                title="✅ 完美匹配"
                value={perfectMatchCount}
                valueStyle={{ color: '#52c41a', fontSize: 32 }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card hoverable onClick={() => handleShowDetails('tolerance')} style={{ cursor: 'pointer', borderLeft: '4px solid #1890ff' }}>
              <Statistic
                title="💡 可解释性匹配"
                value={explainableCount}
                valueStyle={{ color: '#1890ff', fontSize: 32 }}
                suffix={
                  <Text type="secondary" style={{ fontSize: 14 }}>
                    (容差{stats?.toleranceCount || 0} + 代付{stats?.proxyCount || 0} + AI{stats?.aiCount || 0})
                  </Text>
                }
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card style={{ borderLeft: '4px solid #ff4d4f' }}>
              <Statistic
                title="⚠️ 异常"
                value={exceptionCount}
                valueStyle={{ color: exceptionCount > 0 ? '#ff4d4f' : '#999', fontSize: 32 }}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[24, 24]}>
          {/* 左侧：异常检测结果表 */}
          <Col span={16}>
            <Card title="异常检测结果" style={{ marginBottom: 24 }}>
              {exceptions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>
                  {batch?.status === 'completed' ? <CheckCircleOutlined style={{ fontSize: 24, color: '#52c41a', marginBottom: 8 }} /> : null}
                  <p>{batch?.status === 'completed' ? '未发现异常' : '暂无异常数据'}</p>
                </div>
              ) : (
                <Table
                  dataSource={exceptions}
                  rowKey="id"
                  pagination={{
                    pageSize: exceptionPageSize,
                    onShowSizeChange: (_, size) => setExceptionPageSize(size),
                    showSizeChanger: true,
                    pageSizeOptions: ['5', '10', '20', '50'],
                    showTotal: (total) => `共 ${total} 条`
                  }}
                  columns={[
                    { title: '风险等级', dataIndex: 'severity', width: 100, render: renderSeverity },
                    { title: '异常类型', dataIndex: 'type', width: 120, render: renderExceptionType },
                    { title: '银行流水详情', dataIndex: 'detail', ellipsis: true, render: (val: string) => parseExceptionDetail(val) },
                    { title: 'AI建议操作', dataIndex: 'suggestion', ellipsis: true },
                    {
                      title: '操作',
                      width: 160,
                      render: (_, record) => (
                        <Space>
                          {record.status === 'pending' && (
                            <>
                              <Button size="small" type="link" onClick={() => handleResolveException(record.id, 'resolved')}>已解决</Button>
                              <Button size="small" type="link" danger onClick={() => handleResolveException(record.id, 'ignored')}>忽略</Button>
                            </>
                          )}
                          {record.status !== 'pending' && (
                            <Tag color="default">{record.status === 'resolved' ? '已解决' : '已忽略'}</Tag>
                          )}
                        </Space>
                      )
                    }
                  ]}
                />
              )}
            </Card>
          </Col>

          {/* 右侧：报告列表 */}
          <Col span={8}>
            {sourceFiles && (
              <Card title="导入文件" style={{ marginBottom: 24 }}>
                <div style={{ marginBottom: 16 }}>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>银行流水 ({sourceFiles.bankFiles.length})</Text>
                  <List
                    size="small"
                    split={false}
                    dataSource={sourceFiles.bankFiles}
                    renderItem={item => (
                      <List.Item style={{ padding: '2px 0' }}>
                        <Typography.Text style={{ fontSize: 13 }} ellipsis={{ tooltip: item.path }}>
                          📄 {item.name}
                        </Typography.Text>
                      </List.Item>
                    )}
                  />
                </div>
                <div>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>发票文件 ({sourceFiles.invoiceFiles.length})</Text>
                  <List
                    size="small"
                    split={false}
                    dataSource={sourceFiles.invoiceFiles}
                    renderItem={item => {
                      const isPdf = item.name.toLowerCase().endsWith('.pdf')
                      const isAutoGenerated = item.name.startsWith('发票清单_') && item.name.endsWith('.xlsx')
                      const icon = isPdf ? '🧾' : '📊'
                      const tag = isAutoGenerated ? ' [自动生成]' : ''
                      return (
                        <List.Item style={{ padding: '2px 0' }}>
                          <Typography.Text style={{ fontSize: 13 }} ellipsis={{ tooltip: item.path }}>
                            {icon} {item.name}{tag}
                          </Typography.Text>
                        </List.Item>
                      )
                    }}
                  />
                </div>
              </Card>
            )}

            <Card title="📊 对账报告" style={{ marginBottom: 24 }}>
              {reportList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>
                  <p>{batch?.status === 'completed' || batch?.status === 'unbalanced' ? '报告将在对账完成后自动生成' : '暂无报告'}</p>
                </div>
              ) : (
                <List
                  dataSource={reportList}
                  renderItem={(report: ReportInfo) => (
                    <List.Item
                      actions={[
                        <Button
                          key="download"
                          type="link"
                          icon={<DownloadOutlined />}
                          onClick={() => handleOpenReport(report.filePath)}
                        >
                          打开
                        </Button>
                      ]}
                    >
                      <List.Item.Meta
                        title={report.name}
                        description={
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {report.createdAt ? new Date(report.createdAt).toLocaleString() : ''}
                          </Text>
                        }
                      />
                    </List.Item>
                  )}
                />
              )}
            </Card>
          </Col>
        </Row>

        <Modal
          title={`${getMatchTypeName(detailsType)}列表`}
          open={detailsModalVisible}
          width={1000}
          onCancel={() => setDetailsModalVisible(false)}
          footer={null}
          destroyOnClose
        >
          <Table
            dataSource={detailsData}
            loading={detailsLoading}
            rowKey="id"
            scroll={{ y: 500 }}
            pagination={{
              pageSize: 10,
              showTotal: (total) => `共 ${total} 条`
            }}
            columns={[
              { title: '银行方', dataIndex: 'bankPayer', width: 200 },
              { title: '银行金额', dataIndex: 'bankAmount', width: 100, align: 'right', render: (val: number) => val?.toFixed(2) },
              { title: '发票方', dataIndex: 'invoiceSeller', width: 200 },
              { title: '发票金额', dataIndex: 'invoiceAmount', width: 100, align: 'right', render: (val: number) => val?.toFixed(2) },
              { title: '差异', dataIndex: 'amountDiff', width: 100, align: 'right', render: (val: number) => val !== 0 ? <span style={{ color: 'red' }}>{val?.toFixed(2)}</span> : '-' },
              { title: '原因', dataIndex: 'reason' },
              { title: '置信度', dataIndex: 'confidence', width: 80, render: (val: number) => (val * 100).toFixed(0) + '%' },
            ]}
          />
        </Modal>

        {/* 代付检测弹窗 */}
        <MappingReminderModal
          open={proxyModalVisible}
          batchId={id || ''}
          proxyPayments={proxyPayments}
          sellerSuggestions={sellerSuggestions}
          onAddMappings={handleAddMappings}
          onSkip={handleSkipProxyDetection}
          onCancel={() => setProxyModalVisible(false)}
        />

      </div>
    </Spin >
  )
}

export default ReconciliationDetail
