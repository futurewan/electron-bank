import { FileTextOutlined } from '@ant-design/icons'
import { Button, List, Modal, Tabs, Tag, Typography } from 'antd'
import React from 'react'

const { Text } = Typography

export interface FileInfo {
  name: string
  path: string
  size: number
  modifiedAt: Date
}

interface ImportConfirmModalProps {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
  bankFiles: FileInfo[]
  invoiceFiles: FileInfo[]
  loading?: boolean
}

const ImportConfirmModal: React.FC<ImportConfirmModalProps> = ({
  open,
  onCancel,
  onConfirm,
  bankFiles,
  invoiceFiles,
  loading,
}) => {
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const renderFileList = (files: FileInfo[]) => (
    <List
      dataSource={files}
      renderItem={(item) => (
        <List.Item>
          <List.Item.Meta
            avatar={<FileTextOutlined style={{ fontSize: 24, color: '#1890ff' }} />}
            title={item.name}
            description={
              <Text type="secondary" style={{ fontSize: 12 }}>
                {formatSize(item.size)} • {new Date(item.modifiedAt).toLocaleString()}
              </Text>
            }
          />
        </List.Item>
      )}
      locale={{ emptyText: '没有找到 Excel 文件' }}
      style={{ maxHeight: 300, overflow: 'auto' }}
    />
  )

  const items = [
    {
      key: 'bank',
      label: (
        <span>
          银行流水 <Tag color="blue">{bankFiles.length}</Tag>
        </span>
      ),
      children: renderFileList(bankFiles),
    },
    {
      key: 'invoice',
      label: (
        <span>
          发票文件 <Tag color="green">{invoiceFiles.length}</Tag>
        </span>
      ),
      children: renderFileList(invoiceFiles),
    },
  ]

  return (
    <Modal
      title="确认自动导入"
      open={open}
      onCancel={onCancel}
      width={600}
      className="import-confirm-modal"
      footer={[
        <Button key="cancel" onClick={onCancel} disabled={loading}>
          取消
        </Button>,
        <Button 
          key="confirm" 
          type="primary" 
          onClick={onConfirm} 
          loading={loading}
          disabled={bankFiles.length === 0 && invoiceFiles.length === 0}
        >
          确认导入
        </Button>,
      ]}
    >
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary">
          系统检测到以下文件，请确认是否导入。如果是首次使用，建议检查文件列表是否正确。
        </Text>
      </div>
      
      <Tabs defaultActiveKey="bank" items={items} />
    </Modal>
  )
}

export default ImportConfirmModal
