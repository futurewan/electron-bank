import { BankOutlined, UserOutlined } from '@ant-design/icons'
import { AutoComplete, Form, Input, message, Modal } from 'antd'
import React, { useEffect, useState } from 'react'

// 获取 electron API
const electron = (window as any).electron

interface PayerMapping {
  id: string
  personName: string
  companyName: string
  accountSuffix?: string
  remark?: string
  source: string
  createdAt: string
}

interface AddMappingModalProps {
  visible: boolean
  mapping: PayerMapping | null
  onCancel: () => void
  onSuccess: () => void
}

const AddMappingModal: React.FC<AddMappingModalProps> = ({
  visible,
  mapping,
  onCancel,
  onSuccess
}) => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<{ value: string }[]>([])
  
  const isEditing = !!mapping
  
  // 初始化表单
  useEffect(() => {
    if (visible) {
      if (mapping) {
        form.setFieldsValue({
          personName: mapping.personName,
          companyName: mapping.companyName,
          accountSuffix: mapping.accountSuffix,
          remark: mapping.remark
        })
      } else {
        form.resetFields()
      }
      
      // 加载销售方建议
      loadSuggestions()
    }
  }, [visible, mapping])
  
  const loadSuggestions = async () => {
    try {
      const res = await electron.reconciliation.getSellerSuggestions()
      if (res.success) {
        setSuggestions(res.suggestions?.map((s: string) => ({ value: s })) || [])
      }
    } catch (e) {
      console.error('加载建议失败:', e)
    }
  }
  
  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)
      
      if (isEditing && mapping) {
        // 更新
        const res = await electron.reconciliation.updateMapping(mapping.id, {
          personName: values.personName,
          companyName: values.companyName,
          accountSuffix: values.accountSuffix || null,
          remark: values.remark || null
        })
        
        if (res.success) {
          message.success('更新成功')
          onSuccess()
        } else {
          message.error('更新失败: ' + res.error)
        }
      } else {
        // 添加
        const res = await electron.reconciliation.batchAddMappings([{
          personName: values.personName,
          companyName: values.companyName,
          accountSuffix: values.accountSuffix || undefined,
          remark: values.remark || undefined,
          source: 'manual'
        }])
        
        if (res.success && res.addedCount > 0) {
          message.success('添加成功')
          onSuccess()
        } else {
          message.error('添加失败: ' + (res.error || res.errors?.[0]?.error))
        }
      }
    } catch (error: any) {
      if (error?.errorFields) {
        // 表单验证错误，不需要提示
        return
      }
      message.error('操作出错')
    } finally {
      setLoading(false)
    }
  }
  
  const handleSearch = (_text: string) => {
    // 已经加载了全部建议，只需客户端过滤
  }
  
  return (
    <Modal
      title={isEditing ? '编辑映射关系' : '添加映射关系'}
      open={visible}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        preserve={false}
      >
        <Form.Item
          name="personName"
          label="付款人"
          rules={[{ required: true, message: '请输入付款人姓名' }]}
        >
          <Input 
            prefix={<UserOutlined />} 
            placeholder="个人户名，如：张三"
          />
        </Form.Item>
        
        <Form.Item
          name="companyName"
          label="对应公司"
          rules={[{ required: true, message: '请输入对应的公司名称' }]}
        >
          <AutoComplete
            options={suggestions}
            onSearch={handleSearch}
            placeholder="输入或选择公司名称"
            filterOption={(inputValue, option) =>
              option?.value.toLowerCase().includes(inputValue.toLowerCase()) ?? false
            }
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
      </Form>
    </Modal>
  )
}

export default AddMappingModal
