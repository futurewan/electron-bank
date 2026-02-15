import { ExclamationCircleOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons'
import { Alert, Button, message, Modal, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import React, { useState } from 'react'
import QuickAddForm from './QuickAddForm.tsx'
import styles from './index.module.scss'
import type { AggregatedProxyPayment, NewMappingInput } from './types'
export type { AggregatedProxyPayment, NewMappingInput }

const { Text } = Typography



interface MappingReminderModalProps {
  open: boolean
  batchId: string
  proxyPayments: AggregatedProxyPayment[]
  sellerSuggestions: string[]
  onAddMappings: (mappings: NewMappingInput[]) => Promise<void>
  onSkip: () => void
  onCancel: () => void
}

const MappingReminderModal: React.FC<MappingReminderModalProps> = ({
  open,
  proxyPayments,
  sellerSuggestions,
  onAddMappings,
  onSkip,
  onCancel,
}) => {
  const [mode, setMode] = useState<'preview' | 'adding'>('preview')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [pendingMappings, setPendingMappings] = useState<NewMappingInput[]>([])
  const [loading, setLoading] = useState(false)

  const columns: ColumnsType<AggregatedProxyPayment> = [
    {
      title: '付款人',
      dataIndex: 'payerName',
      key: 'payerName',
      render: (name: string) => (
        <Space>
          <UserOutlined />
          <Text strong>{name}</Text>
        </Space>
      ),
    },
    {
      title: '金额',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      align: 'right',
      render: (amount: number) => (
        <Text type="success">¥{amount.toLocaleString()}</Text>
      ),
    },
    {
      title: '笔数',
      dataIndex: 'transactionCount',
      key: 'transactionCount',
      align: 'center',
      render: (count: number) => <Tag color="blue">{count}笔</Tag>,
    },
    {
      title: '检测原因',
      dataIndex: 'reason',
      key: 'reason',
      render: (reason: string) => <Tag color="orange">{reason}</Tag>,
    },
  ]

  const handleStartAdding = () => {
    setMode('adding')
    setCurrentIndex(0)
    setPendingMappings([])
  }

  const handleAddMapping = (mapping: NewMappingInput) => {
    setPendingMappings(prev => [...prev, mapping])
    
    if (currentIndex < proxyPayments.length - 1) {
      setCurrentIndex(prev => prev + 1)
    } else {
      // 所有映射已添加，提交
      handleSubmitMappings([...pendingMappings, mapping])
    }
  }

  const handleSkipCurrent = () => {
    if (currentIndex < proxyPayments.length - 1) {
      setCurrentIndex(prev => prev + 1)
    } else {
      // 最后一条也跳过，提交已添加的
      if (pendingMappings.length > 0) {
        handleSubmitMappings(pendingMappings)
      } else {
        onSkip()
      }
    }
  }

  const handleSubmitMappings = async (mappings: NewMappingInput[]) => {
    if (mappings.length === 0) {
      onSkip()
      return
    }

    setLoading(true)
    try {
      await onAddMappings(mappings)
      message.success(`成功添加 ${mappings.length} 条映射关系`)
    } catch (error: any) {
      message.error('添加映射失败: ' + (error?.message || '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    setMode('preview')
    setCurrentIndex(0)
    setPendingMappings([])
  }

  const currentPayment = proxyPayments[currentIndex]

  return (
    <Modal
      title={
        <Space>
          <ExclamationCircleOutlined style={{ color: '#faad14' }} />
          <span>发现可能的代付记录</span>
        </Space>
      }
      open={open}
      onCancel={onCancel}
      width={mode === 'preview' ? 700 : 500}
      footer={null}
      maskClosable={false}
    >
      {mode === 'preview' ? (
        <div className={styles.previewMode}>
          <Alert
            message="以下银行流水的付款人可能是个人代付，但未找到对应的映射关系"
            description="如果这些是公司员工代付，建议添加映射关系以提高匹配率。"
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
          
          <Table
            dataSource={proxyPayments}
            columns={columns}
            rowKey="payerName"
            pagination={proxyPayments.length > 5 ? { pageSize: 5 } : false}
            size="small"
          />
          
          <div className={styles.footer}>
            <Space>
              <Button onClick={onCancel}>取消</Button>
              <Button onClick={onSkip}>跳过，继续对账</Button>
              <Button 
                type="primary" 
                icon={<PlusOutlined />}
                onClick={handleStartAdding}
              >
                添加映射关系
              </Button>
            </Space>
          </div>
        </div>
      ) : (
        <div className={styles.addingMode}>
          <div className={styles.progress}>
            <Text type="secondary">
              添加映射 ({currentIndex + 1} / {proxyPayments.length})
            </Text>
            {pendingMappings.length > 0 && (
              <Tag color="green">已添加 {pendingMappings.length} 条</Tag>
            )}
          </div>
          
          {currentPayment && (
            <QuickAddForm
              payerName={currentPayment.payerName}
              amount={currentPayment.totalAmount}
              transactionCount={currentPayment.transactionCount}
              sellerSuggestions={sellerSuggestions}
              onSubmit={handleAddMapping}
              onSkip={handleSkipCurrent}
              onBack={currentIndex === 0 ? handleBack : undefined}
              loading={loading}
              isLast={currentIndex === proxyPayments.length - 1}
            />
          )}
        </div>
      )}
    </Modal>
  )
}

export default MappingReminderModal
