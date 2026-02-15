import { FolderOpenOutlined, FolderOutlined, SaveOutlined } from '@ant-design/icons'
import { Button, Card, Divider, Form, Input, Layout, message, Space, Typography } from 'antd'
import React, { useEffect, useState } from 'react'

const { Title, Text } = Typography
const { Content } = Layout

const electron = (window as any).electron

/**
 * 设置页面
 * 工作目录配置（单一目录）
 */
const SettingsPage: React.FC = () => {
    const [form] = Form.useForm()
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

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
            const res = await electron.config.getAll()
            if (res.success && res.config) {
                form.setFieldsValue({
                    workspaceFolder: res.config.workspaceFolder,
                })
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
            await electron.config.set('workspaceFolder', values.workspaceFolder)

            // 如果工作目录有值，自动初始化子文件夹
            if (values.workspaceFolder) {
                const initResult = await electron.file.initWorkspace(values.workspaceFolder)
                if (initResult.success && initResult.created.length > 0) {
                    message.success(`设置已保存，自动创建了 ${initResult.created.length} 个子文件夹`)
                } else {
                    message.success('设置已保存')
                }
            } else {
                message.success('设置已保存')
            }
        } catch (error) {
            message.error('保存失败')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Content style={{ padding: '24px', maxWidth: 800, margin: '0 auto' }}>
            <div style={{ marginBottom: 24 }}>
                <Title level={2}>系统设置</Title>
                <Divider />
            </div>

            <Card title="工作目录配置" bordered={false} loading={loading} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
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

                <Form
                    form={form}
                    layout="vertical"
                    onFinish={onFinish}
                >
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

                    <Divider />

                    <Form.Item>
                        <Button
                            type="primary"
                            htmlType="submit"
                            icon={<SaveOutlined />}
                            loading={saving}
                            size="large"
                            style={{ borderRadius: 8 }}
                        >
                            保存配置
                        </Button>
                    </Form.Item>
                </Form>
            </Card>
        </Content>
    )
}

export default SettingsPage
