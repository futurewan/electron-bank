import { FolderOpenOutlined, FolderOutlined, SaveOutlined, ApiOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { Button, Card, Divider, Form, Input, Layout, message, Select, Space, Tag, Typography } from 'antd'
import React, { useEffect, useState } from 'react'

const { Title, Text } = Typography
const { Content } = Layout
const { Option } = Select

const electron = (window as any).electron

/**
 * 设置页面
 * 工作目录配置 + AI 配置
 */
const SettingsPage: React.FC = () => {
    const [form] = Form.useForm()
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [hasApiKey, setHasApiKey] = useState(false)

    useEffect(() => {
        loadConfig()

        const handleFocus = () => {
            loadConfig()
        }

        window.addEventListener('focus', handleFocus)
        return () => {
            window.removeEventListener('focus', handleFocus)
        }
    }, [])

    const loadConfig = async () => {
        setLoading(true)
        try {
            // 1. 加载工作目录配置
            const res = await electron.config.getAll()
            if (res.success && res.config) {
                form.setFieldsValue({
                    workspaceFolder: res.config.workspaceFolder,
                })
            }

            // 2. 加载 AI 配置
            const aiRes = await electron.ai.getConfig()
            if (aiRes.success && aiRes.config) {
                form.setFieldsValue({
                    aiProvider: aiRes.config.provider,
                    aiModel: aiRes.config.model,
                })
                setHasApiKey(aiRes.config.hasApiKey)

                // 初次加载时，如果不匹配，手动设置默认值
                if (!aiRes.config.provider) {
                    form.setFieldsValue({
                        aiProvider: 'deepseek',
                        aiModel: 'deepseek-chat'
                    })
                }
            }

        } catch (error) {
            message.error('加载配置失败')
        } finally {
            setLoading(false)
        }
    }

    const handleSelectFolder = async () => {
        try {
            const res = await electron.file.selectFolder('选择工作目录')
            if (res.success && !res.canceled && res.folderPath) {
                form.setFieldsValue({ workspaceFolder: res.folderPath })
            }
        } catch (error) {
            message.error('选择文件夹失败')
        }
    }

    const handleOpenFolder = async (path: string) => {
        if (!path) return
        try {
            const error = await electron.app.openPath(path)
            if (error) {
                console.error('Open path error:', error)
                message.error('打开文件夹失败')
            }
        } catch (error) {
            message.error('打开文件夹失败')
        }
    }

    const onFinish = async (values: any) => {
        setSaving(true)
        try {
            // 1. 保存工作目录
            if (values.workspaceFolder) {
                await electron.config.set('workspaceFolder', values.workspaceFolder)
                await electron.file.initWorkspace(values.workspaceFolder)
            }

            // 2. 保存 AI 配置
            await electron.ai.setConfig({
                provider: values.aiProvider,
                model: values.aiModel,
            })

            // 3. 如果输入了新的 API Key，则更新
            if (values.aiApiKey) {
                const keyRes = await electron.ai.setKey(values.aiProvider, values.aiApiKey)
                if (keyRes.success) {
                    setHasApiKey(true)
                    form.setFieldsValue({ aiApiKey: '' }) // 清空输入框，安全起见
                } else {
                    message.error(`API Key 设置失败: ${keyRes.error}`)
                    return // 中断
                }
            }

            message.success('设置已保存')
            // 重新加载以刷新状态
            loadConfig()

        } catch (error) {
            message.error('保存失败')
        } finally {
            setSaving(false)
        }
    }

    // 监听 Provider 变化，自动填充默认 Model
    const handleProviderChange = (value: string) => {
        const currentModel = form.getFieldValue('aiModel')
        // 只有当模型为空或者是其他默认值时才覆盖
        if (!currentModel || currentModel === 'gpt-4o-mini' || currentModel === 'claude-3-haiku-20240307' || currentModel === 'deepseek-chat') {
            if (value === 'deepseek') {
                form.setFieldsValue({ aiModel: 'deepseek-chat' })
            } else if (value === 'openai') {
                form.setFieldsValue({ aiModel: 'gpt-4o-mini' })
            } else if (value === 'anthropic') {
                form.setFieldsValue({ aiModel: 'claude-3-haiku-20240307' })
            }
        }

        // 切换 Provider 时，重新检查 Key 状态
        checkKeyStatus(value)
    }

    const checkKeyStatus = async (provider: string) => {
        const res = await electron.ai.checkKey(provider)
        setHasApiKey(res.valid)
    }

    return (
        <Content style={{ padding: '24px', maxWidth: 800, margin: '0 auto', overflowY: 'auto', height: '100%' }}>
            <div style={{ marginBottom: 24 }}>
                <Title level={2}>系统设置</Title>
                <Divider />
            </div>

            <Form
                form={form}
                layout="vertical"
                onFinish={onFinish}
                initialValues={{
                    aiProvider: 'deepseek',
                    aiModel: 'deepseek-chat'
                }}
            >
                <Space direction="vertical" size={24} style={{ width: '100%', paddingBottom: 40 }}>
                    {/* 工作目录配置 */}
                    <Card title={<Space><FolderOpenOutlined /> 工作目录配置</Space>} bordered={false} loading={loading} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                        <div style={{
                            background: '#f5f5f5',
                            borderRadius: 8,
                            padding: '12px 16px',
                            marginBottom: 24,
                            fontSize: 13,
                            color: '#555',
                        }}>
                            <p style={{ margin: '0 0 8px', fontWeight: 500 }}>系统将在工作目录中自动维护以下子文件夹：</p>
                            <div>📁 <Text strong>00归档</Text> — 对账完成后的备份目录（自动归档）</div>
                            <div>📁 <Text strong>01发票</Text> — 放置发票文件（待核销）</div>
                            <div>📁 <Text strong>02银行流水</Text> — 放置银行流水文件（待核销）</div>
                        </div>

                        <Form.Item
                            label="工作目录"
                            required
                            tooltip="选择一个文件夹作为工作目录，系统会自动管理子目录结构"
                            extra="核销完成后，源文件会自动移动到 00归档 的日期子文件夹中"
                            shouldUpdate={(prev, curr) => prev.workspaceFolder !== curr.workspaceFolder}
                        >
                            {({ getFieldValue }) => (
                                <Space.Compact style={{ width: '100%' }}>
                                    <Form.Item
                                        name="workspaceFolder"
                                        noStyle
                                        rules={[{ required: true, message: '请配置工作目录' }]}
                                    >
                                        <Input placeholder="请选择工作目录..." readOnly />
                                    </Form.Item>
                                    <Button
                                        icon={<FolderOpenOutlined />}
                                        onClick={handleSelectFolder}
                                    >
                                        选择目录
                                    </Button>
                                    {getFieldValue('workspaceFolder') && (
                                        <Button
                                            icon={<FolderOutlined />}
                                            onClick={() => handleOpenFolder(getFieldValue('workspaceFolder'))}
                                        >
                                            打开
                                        </Button>
                                    )}
                                </Space.Compact>
                            )}
                        </Form.Item>
                    </Card>

                    {/* AI 配置 */}
                    <Card title={<Space><ApiOutlined /> AI 模型配置</Space>} bordered={false} loading={loading} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                        <div style={{
                            background: '#e6f7ff',
                            border: '1px solid #91d5ff',
                            borderRadius: 8,
                            padding: '12px 16px',
                            marginBottom: 24,
                            fontSize: 13,
                            color: '#0050b3',
                        }}>
                            <p style={{ margin: 0 }}>
                                <Text strong>推荐使用 DeepSeek V3</Text>：性价比极高，且推理能力足以应对对账场景。
                            </p>
                        </div>

                        <Space size={16} style={{ display: 'flex' }} align="start">
                            <Form.Item
                                label="AI 提供商"
                                name="aiProvider"
                                style={{ width: 200 }}
                                rules={[{ required: true, message: '请选择 AI 提供商' }]}
                            >
                                <Select onChange={handleProviderChange}>
                                    <Option value="deepseek">DeepSeek (推荐)</Option>
                                    <Option value="openai">OpenAI</Option>
                                    <Option value="anthropic">Anthropic (Claude)</Option>
                                    <Option value="custom">Custom (自定义)</Option>
                                </Select>
                            </Form.Item>

                            <Form.Item
                                label="模型名称"
                                name="aiModel"
                                style={{ flex: 1 }}
                                rules={[{ required: true, message: '请输入模型名称' }]}
                                tooltip="DeepSeek V3 请使用 'deepseek-chat', R1 请使用 'deepseek-reasoner'"
                            >
                                <Input placeholder="e.g. deepseek-chat" />
                            </Form.Item>
                        </Space>

                        <Form.Item
                            label={
                                <Space>
                                    API Key
                                    {hasApiKey ? (
                                        <Tag icon={<CheckCircleOutlined />} color="success">已配置</Tag>
                                    ) : (
                                        <Tag icon={<CloseCircleOutlined />} color="error">未配置</Tag>
                                    )}
                                </Space>
                            }
                            name="aiApiKey"
                            // 不必填，如果不填则不更新
                            extra="如果不修改 Key，请留空。Key 会被加密存储。"
                        >
                            <Input.Password placeholder="输入新的 API Key 以更新..." />
                        </Form.Item>
                    </Card>

                    {/* 保存按钮区域 */}
                    <div style={{ textAlign: 'center', marginTop: 12 }}>
                        <Button
                            type="primary"
                            htmlType="submit"
                            icon={<SaveOutlined />}
                            loading={saving}
                            size="large"
                            style={{
                                borderRadius: 8,
                                minWidth: 200,
                                height: 48,
                                fontSize: 16,
                                boxShadow: '0 4px 12px rgba(24, 144, 255, 0.3)'
                            }}
                        >
                            保存所有配置
                        </Button>
                    </div>
                </Space>
            </Form>
        </Content>
    )
}

export default SettingsPage
