/**
 * 登录页面
 * @module pages/Auth/Login
 */

import { useState, useEffect } from 'react'
import { Form, Input, Button, Checkbox, message } from 'antd'
import { User, Lock } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../../stores/authStore'
import type { LoginFormData } from '../../../types/auth'
import styles from './Login.module.css'

function LoginPage(): JSX.Element {
    const navigate = useNavigate()
    const [form] = Form.useForm()
    const [messageApi, contextHolder] = message.useMessage()

    const { login, isLoading, isLoggedIn, rememberedUsername } = useAuthStore()
    const [showPassword, setShowPassword] = useState(false)

    // 如果已登录，重定向到首页
    useEffect(() => {
        if (isLoggedIn) {
            navigate('/', { replace: true })
        }
    }, [isLoggedIn, navigate])

    // 填充记住的用户名
    useEffect(() => {
        if (rememberedUsername) {
            form.setFieldsValue({
                username: rememberedUsername,
                remember: true,
            })
        }
    }, [rememberedUsername, form])

    // 处理登录提交
    const handleSubmit = async (values: LoginFormData) => {
        const result = await login(values.username, values.password, values.remember)

        if (result.success) {
            messageApi.success('登录成功，正在跳转...')
            // 延迟跳转，让用户看到成功提示
            setTimeout(() => {
                navigate('/', { replace: true })
            }, 500)
        } else {
            messageApi.error(result.message)
        }
    }

    return (
        <div className={styles.container}>
            {contextHolder}
            <div className={styles.card}>
                {/* Logo 区域 */}
                <div className={styles.logoSection}>
                    <div className={styles.logoIcon}>💰</div>
                    <h1 className={styles.title}>AI 对账助手</h1>
                    <p className={styles.subtitle}>智能对账，轻松管理</p>
                </div>

                {/* 登录表单 */}
                <Form
                    form={form}
                    name="login"
                    onFinish={handleSubmit}
                    autoComplete="off"
                    layout="vertical"
                    requiredMark={false}
                    initialValues={{ remember: false }}
                >
                    <Form.Item
                        name="username"
                        rules={[{ required: true, message: '请输入用户名' }]}
                    >
                        <Input
                            prefix={<User size={18} className={styles.inputIcon} />}
                            placeholder="用户名"
                            size="large"
                            className={styles.input}
                        />
                    </Form.Item>

                    <Form.Item
                        name="password"
                        rules={[{ required: true, message: '请输入密码' }]}
                    >
                        <Input.Password
                            prefix={<Lock size={18} className={styles.inputIcon} />}
                            placeholder="密码"
                            size="large"
                            className={styles.input}
                            visibilityToggle={{
                                visible: showPassword,
                                onVisibleChange: setShowPassword,
                            }}
                        />
                    </Form.Item>

                    <Form.Item name="remember" valuePropName="checked">
                        <Checkbox className={styles.remember}>记住登录</Checkbox>
                    </Form.Item>

                    <Form.Item>
                        <Button
                            type="primary"
                            htmlType="submit"
                            size="large"
                            block
                            loading={isLoading}
                            className={styles.submitButton}
                        >
                            登 录
                        </Button>
                    </Form.Item>
                </Form>

                {/* 注册链接 */}
                <div className={styles.registerLink}>
                    没有账号？
                    <Link to="/register" className={styles.link}>
                        立即注册
                    </Link>
                </div>
            </div>

            {/* 底部版权 */}
            <div className={styles.footer}>
                <p>© 2024 AI 对账助手. All rights reserved.</p>
            </div>
        </div>
    )
}

export default LoginPage
