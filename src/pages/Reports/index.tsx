import { Button, Card, Col, Empty, Input, message, Row, Space, Spin, Tag, Typography } from 'antd'
import { Download, ExternalLink, FileText, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import styles from './Reports.module.scss'

const { Title, Text } = Typography

// 获取 electron API
const electron = (window as any).electron

interface ReportInfo {
  id: string
  batchId: string | null
  name: string
  filePath: string
  type: string
  createdAt: string
}

const ReportsCenter: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const [reports, setReports] = useState<ReportInfo[]>([])
  const [searchText, setSearchText] = useState('')

  const loadReports = useCallback(async () => {
    setLoading(true)
    try {
      const res = await electron.reconciliation.getAllReports()
      if (res.success) {
        setReports(res.reports || [])
      } else {
        message.error('加载报告失败: ' + res.error)
      }
    } catch (error) {
      console.error('加载报告出错:', error)
      message.error('加载报告出错')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  const getReportTypeTag = (type: string) => {
    switch (type) {
      case 'auto_entry': return <Tag color="blue">自动入账</Tag>
      case 'explainable': return <Tag color="purple">可解释性</Tag>
      case 'exceptions': return <Tag color="orange">异常报告</Tag>
      case 'summary': return <Tag color="cyan">汇总报告</Tag>
      default: return <Tag color="default">其他</Tag>
    }
  }

  const filteredReports = reports.filter(r =>
    r.name.toLowerCase().includes(searchText.toLowerCase())
  ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const handleOpenFile = (path: string) => {
    electron.app.showInFolder(path)
  }

  return (
    <Spin spinning={loading}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.titleSection}>
            <FileText size={28} color="#6366F1" />
            <Title level={3} style={{ margin: 0 }}>报告中心</Title>
          </div>
          <Space>
            <Input
              placeholder="搜索报告名称..."
              prefix={<Search size={16} color="#94a3b8" />}
              style={{ width: 300 }}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
            <Button onClick={loadReports}>刷新</Button>
          </Space>
        </div>

        {filteredReports.length > 0 ? (
          <Row gutter={[16, 16]}>
            {filteredReports.map(report => (
              <Col span={24} key={report.id}>
                <Card className={styles.reportCard} bordered={false}>
                  <div className={styles.reportInfo}>
                    <div className={styles.reportMain}>
                      <Space size="middle">
                        <div className={styles.fileIcon}>
                          <Download size={20} color="#6366F1" />
                        </div>
                        <div>
                          <Text strong style={{ fontSize: 16, display: 'block' }}>{report.name}.xlsx</Text>
                          <Space>
                            {getReportTypeTag(report.type)}
                            <Text type="secondary" style={{ fontSize: 13 }}>
                              生成于 {new Date(report.createdAt).toLocaleString()}
                            </Text>
                          </Space>
                        </div>
                      </Space>
                    </div>
                    <div className={styles.actions}>
                      <Button 
                        type="primary" 
                        ghost 
                        icon={<ExternalLink size={16} />}
                        onClick={() => handleOpenFile(report.filePath)}
                      >
                        打开所在目录
                      </Button>
                    </div>
                  </div>
                  <div className={styles.pathLabel}>
                    路径：{report.filePath}
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        ) : (
          <Empty description="暂无生成的报告" style={{ marginTop: 100 }} />
        )}
      </div>
    </Spin>
  )
}

export default ReportsCenter
