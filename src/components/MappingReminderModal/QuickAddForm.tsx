import { BankOutlined, RightOutlined, SaveOutlined, UserOutlined } from '@ant-design/icons'
import { AutoComplete, Button, Card, Form, Input, Space, Tag, Typography } from 'antd'
import React, { useState } from 'react'
import styles from './index.module.scss'
import type { NewMappingInput } from './types'

const { Text, Title } = Typography

interface QuickAddFormProps {
  payerName: string
  amount: number
  transactionCount: number
  sellerSuggestions: string[]
  onSubmit: (mapping: NewMappingInput) => void
  onSkip: () => void
  onBack?: () => void
  loading?: boolean
  isLast?: boolean
}

const QuickAddForm: React.FC<QuickAddFormProps> = ({
  payerName,
  amount,
  transactionCount,
  sellerSuggestions,
  onSubmit,
  onSkip,
  onBack,
  loading,
  isLast,
}) => {
  const [form] = Form.useForm()
  const [options, setOptions] = useState<{ value: string }[]>([])

  const handleSearch = (searchText: string) => {
    if (!searchText) {
      setOptions(sellerSuggestions.map(s => ({ value: s })))
      return
    }
    
    const filtered = sellerSuggestions.filter(s => 
      s.toLowerCase().includes(searchText.toLowerCase())
    )
    setOptions(filtered.map(s => ({ value: s })))
  }

  const handleSubmit = (values: any) => {
    onSubmit({
      personName: payerName,
      companyName: values.companyName,
      accountSuffix: values.accountSuffix || undefined,
      remark: values.remark || undefined,
      source: 'quick_add',
    })
    form.resetFields()
  }

  return (
    <div className={styles.quickAddForm}>
      <Card size="small" className={styles.payerCard}>
        <Space>
          <UserOutlined style={{ fontSize: 24, color: '#1890ff' }} />
          <div>
            <Title level={5} style={{ margin: 0 }}>{payerName}</Title>
            <Space size="small">
              <Text type="secondary">共 {transactionCount} 笔</Text>
              <Tag color="green">¥{amount.toLocaleString()}</Tag>
            </Space>
          </div>
        </Space>
      </Card>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        style={{ marginTop: 16 }}
      >
        <Form.Item
          name="companyName"
          label="对应公司"
          rules={[{ required: true, message: '请输入或选择对应的公司名称' }]}
        >
          <AutoComplete
            options={options}
            onSearch={handleSearch}
            onFocus={() => setOptions(sellerSuggestions.map(s => ({ value: s })))}
            placeholder="输入公司名称或从发票中选择"
            size="large"
          >
            <Input prefix={<BankOutlined />} />
          </AutoComplete>
        </Form.Item>

        <Form.Item
          name="accountSuffix"
          label="账户后四位（可选）"
        >
          <Input 
            placeholder="如：1234" 
            maxLength={4}
            style={{ width: 120 }}
          />
        </Form.Item>

        <Form.Item
          name="remark"
          label="备注（可选）"
        >
          <Input.TextArea 
            placeholder="添加备注信息" 
            rows={2}
          />
        </Form.Item>

        <div className={styles.formActions}>
          <Space>
            {onBack && (
              <Button onClick={onBack}>返回</Button>
            )}
            <Button onClick={onSkip}>
              跳过此条
            </Button>
            <Button 
              type="primary" 
              htmlType="submit"
              icon={isLast ? <SaveOutlined /> : <RightOutlined />}
              loading={loading}
            >
              {isLast ? '保存并继续对账' : '保存并继续'}
            </Button>
          </Space>
        </div>
      </Form>
    </div>
  )
}

export default QuickAddForm
