import {
  ClearOutlined,
  DeleteOutlined,
  EditOutlined,
  ExportOutlined,
  ImportOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined
} from '@ant-design/icons'
import {
  Button,
  Card,
  Input,
  message,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import React, { useEffect, useState } from 'react'
import AddMappingModal from './AddMappingModal.tsx'
import styles from './index.module.scss'

const { Title, Text } = Typography
const { Search } = Input

// 获取 electron API
const electron = (window as any).electron
const isElectron = !!electron?.reconciliation

interface PayerMapping {
  id: string
  personName: string
  companyName: string
  accountSuffix?: string
  remark?: string
  source: string
  createdAt: string
}

const sourceLabels: Record<string, { label: string; color: string }> = {
  manual: { label: '手动添加', color: 'blue' },
  ai_extracted: { label: 'AI提取', color: 'purple' },
  imported: { label: '导入', color: 'green' },
  quick_add: { label: '快速添加', color: 'orange' }
}

const PayerMappings: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const [mappings, setMappings] = useState<PayerMapping[]>([])
  const [filteredMappings, setFilteredMappings] = useState<PayerMapping[]>([])
  const [searchText, setSearchText] = useState('')
  
  // 弹窗状态
  const [addModalVisible, setAddModalVisible] = useState(false)
  const [editingMapping, setEditingMapping] = useState<PayerMapping | null>(null)
  
  // 加载数据
  const loadMappings = async () => {
    if (!isElectron) return
    
    setLoading(true)
    try {
      const res = await electron.reconciliation.getAllMappings()
      if (res.success) {
        setMappings(res.mappings || [])
        filterMappings(res.mappings || [], searchText)
      } else {
        message.error('加载映射关系失败: ' + res.error)
      }
    } catch (error) {
      message.error('加载出错')
    } finally {
      setLoading(false)
    }
  }
  
  // 过滤映射
  const filterMappings = (data: PayerMapping[], keyword: string) => {
    if (!keyword) {
      setFilteredMappings(data)
      return
    }
    
    const lower = keyword.toLowerCase()
    const filtered = data.filter(m => 
      m.personName.toLowerCase().includes(lower) ||
      m.companyName.toLowerCase().includes(lower)
    )
    setFilteredMappings(filtered)
  }
  
  // 搜索处理
  const handleSearch = (value: string) => {
    setSearchText(value)
    filterMappings(mappings, value)
  }
  
  // 删除映射
  const handleDelete = async (id: string) => {
    try {
      const res = await electron.reconciliation.deleteMapping(id)
      if (res.success) {
        message.success('删除成功')
        loadMappings()
      } else {
        message.error('删除失败: ' + res.error)
      }
    } catch (error) {
      message.error('删除出错')
    }
  }

  // 导入映射
  const handleImport = async () => {
    if (!isElectron) return
    try {
      const dialogRes = await electron.file.openDialog({
        title: '选择映射文件',
        filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }]
      })
      
      if (dialogRes.canceled || !dialogRes.filePaths[0]) return
      
      setLoading(true)
      message.loading('正在导入...', 0)
      
      const res = await electron.reconciliation.importPayerMappings(dialogRes.filePaths[0])
      
      message.destroy()
      setLoading(false)
      
      if (res.success) {
        message.success(`导入成功: ${res.count} 条记录`)
        loadMappings()
      } else {
        message.error('导入失败: ' + (res.errors?.[0]?.message || res.error))
      }
    } catch (error) {
      setLoading(false)
      message.destroy()
      message.error('导入出错')
    }
  }
  
  // 一键去重
  const handleDeduplicate = async () => {
    try {
      const res = await electron.reconciliation.deduplicateMappings()
      if (res.success) {
        if (res.count > 0) {
          message.success(`成功合并重复数据，删除了 ${res.count} 条记录`)
          loadMappings()
        } else {
          message.info('未发现重复数据')
        }
      } else {
        message.error('去重失败: ' + res.error)
      }
    } catch (error) {
      message.error('去重出错')
    }
  }

  // 导出映射
  const handleExport = async () => {
    try {
      const res = await electron.reconciliation.exportMappings()
      if (res.success) {
        message.success('导出成功: ' + res.filePath)
      } else if (!res.canceled) {
        message.error('导出失败: ' + res.error)
      }
    } catch (error) {
      message.error('导出出错')
    }
  }
  
  // 打开添加弹窗
  const openAddModal = () => {
    setEditingMapping(null)
    setAddModalVisible(true)
  }
  
  // 打开编辑弹窗
  const openEditModal = (mapping: PayerMapping) => {
    setEditingMapping(mapping)
    setAddModalVisible(true)
  }
  
  // 关闭弹窗
  const closeModal = () => {
    setAddModalVisible(false)
    setEditingMapping(null)
  }
  
  // 保存成功后刷新
  const handleSaveSuccess = () => {
    closeModal()
    loadMappings()
  }
  
  useEffect(() => {
    loadMappings()
  }, [])
  
  const columns: ColumnsType<PayerMapping> = [
    {
      title: '付款人',
      dataIndex: 'personName',
      key: 'personName',
      width: 80,
      render: (name: string) => <Text strong>{name}</Text>
    },
    {
      title: '对应公司',
      dataIndex: 'companyName',
      key: 'companyName',
      width: 200,
      ellipsis: true
    },
    {
      title: '账户后四位',
      dataIndex: 'accountSuffix',
      key: 'accountSuffix',
      width: 100,
      align: 'center',
      render: (val: string) => val || '-'
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 150,
      ellipsis: true,
      render: (val: string) => val || '-'
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 100,
      align: 'center',
      render: (source: string) => {
        const info = sourceLabels[source] || { label: source, color: 'default' }
        return <Tag color={info.color}>{info.label}</Tag>
      }
    },
    {
      title: '添加时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (date: string) => date ? new Date(date).toLocaleString() : '-'
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="编辑">
            <Button 
              type="text" 
              size="small" 
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
            />
          </Tooltip>
          <Popconfirm
            title="确认删除?"
            description="删除后无法恢复"
            onConfirm={() => handleDelete(record.id)}
            okText="删除"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button 
                type="text" 
                size="small" 
                danger
                icon={<DeleteOutlined />} 
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ]
  
  return (
    <div className={styles.container}>
      <Card>
        <div className={styles.header}>
          <Title level={4} style={{ margin: 0 }}>付款人映射管理</Title>
          <Space>
            <Search
              placeholder="搜索付款人或公司"
              allowClear
              onSearch={handleSearch}
              onChange={(e) => handleSearch(e.target.value)}
              style={{ width: 240 }}
              prefix={<SearchOutlined />}
            />
            <Tooltip title="刷新">
              <Button icon={<ReloadOutlined />} onClick={loadMappings} />
            </Tooltip>
            <Button icon={<ImportOutlined />} onClick={handleImport}>
              导入
            </Button>
            <Button icon={<ExportOutlined />} onClick={handleExport}>
              导出
            </Button>
            <Popconfirm
              title="确认执行一键去重?"
              description="将合并相同(付款人+公司)的记录，仅保留最早添加的一条"
              onConfirm={handleDeduplicate}
              okText="去重"
              cancelText="取消"
            >
              <Button icon={<ClearOutlined />}>
                一键去重
              </Button>
            </Popconfirm>
            <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
              添加映射
            </Button>
          </Space>
        </div>
        
        <Table
          dataSource={filteredMappings}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (total) => `共 ${total} 条`
          }}
        />
      </Card>
      
      <AddMappingModal
        visible={addModalVisible}
        mapping={editingMapping}
        onCancel={closeModal}
        onSuccess={handleSaveSuccess}
      />
    </div>
  )
}

export default PayerMappings
