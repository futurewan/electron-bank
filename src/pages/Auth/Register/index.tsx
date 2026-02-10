/**
 * 注册页面
 * @module pages/Auth/Register
 */

import { useState, useEffect } from 'react'
import { Form, Input, Button, message } from 'antd'
import { User, Lock, CheckCircle } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../../stores/authStore'
import { validateUsername, validatePasswordStrength } from '../../../utils/auth'
import type { RegisterFormData } from '../../../types/auth'
import styles from './Register.module.css'

function RegisterPage(): JSX.Element {
    const navigate = useNavigate()
    const [form] = Form.useForm()
    const [messageApi, contextHolder] = message.useMessage()

    const { register, isLoading, isLoggedIn } = useAuthStore()
    const [showPassword, setShowPassword] = useState(false)

    // 如果已登录，重定向到首页
    useEffect(() => {
        if (isLoggedIn) {
            navigate('/', { replace: true })
        }
    }, [isLoggedIn, navigate])

    // 处理注册提交
    const handleSubmit = async (values: RegisterFormData) => {
        // 验证密码一致性
        if (values.password !== values.confirmPassword) {
            messageApi.error('两次输入的密码不一致')
            return
        }

        const result = await register(values.username, values.password)

        if (result.success) {
            messageApi.success('注册成功，正在跳转...')
            setTimeout(() => {
                navigate('/', { replace: true })
            }, 500)
        } else {
            messageApi.error(result.message)
        }
    }

    // 用户名验证规则
    const usernameValidator = (_: unknown, value: string) => {
        const result = validateUsername(value)
        if (!result.valid) {
            return Promise.reject(new Error(result.message))
        }
        return Promise.resolve()
    }

    // 密码验证规则
    const passwordValidator = (_: unknown, value: string) => {
        const result = validatePasswordStrength(value)
        if (!result.valid) {
            return Promise.reject(new Error(result.message))
        }
        return Promise.resolve()
    }

    // 确认密码验证规则
    const confirmPasswordValidator = (_: unknown, value: string) => {
        const password = form.getFieldValue('password')
        if (value && value !== password) {
            return Promise.reject(new Error('两次输入的密码不一致'))
        }
        return Promise.resolve()
    }

    return (
        <div className={styles.container}>
            {contextHolder}
            <div className={styles.card}>
                {/* Logo 区域 */}
                <div className={styles.logoSection}>
                    <div className={styles.logoIcon}>💰</div>
                    <h1 className={styles.title}>创建账号</h1>
                    <p className={styles.subtitle}>加入 AI 对账助手，开启智能对账之旅</p>
                </div>

                {/* 注册表单 */}
                <Form
                    form={form}
                    name="register"
                    onFinish={handleSubmit}
                    autoComplete="off"
                    layout="vertical"
                    requiredMark={false}
                >
                    <Form.Item
                        name="username"
                        rules={[
                            { required: true, message: '请输入用户名' },
                            { validator: usernameValidator },
                        ]}
                    >
                        <Input
                            prefix={<User size={18} className={styles.inputIcon} />}
                            placeholder="用户名（3-20 个字符）"
                            size="large"
                            className={styles.input}
                        />
                    </Form.Item>

                    <Form.Item
                        name="password"
                        rules={[
                            { required: true, message: '请输入密码' },
                            { validator: passwordValidator },
                        ]}
                    >
                        <Input.Password
                            prefix={<Lock size={18} className={styles.inputIcon} />}
                            placeholder="密码（至少 6 个字符）"
                            size="large"
                            className={styles.input}
                            visibilityToggle={{
                                visible: showPassword,
                                onVisibleChange: setShowPassword,
                            }}
                        />
                    </Form.Item>

                    <Form.Item
                        name="confirmPassword"
                        dependencies={['password']}
                        rules={[
                            { required: true, message: '请确认密码' },
                            { validator: confirmPasswordValidator },
                        ]}
                    >
                        <Input.Password
                            prefix={<CheckCircle size={18} className={styles.inputIcon} />}
                            placeholder="确认密码"
                            size="large"
                            className={styles.input}
                        />
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
                            注 册
                        </Button>
                    </Form.Item>
                </Form>

                {/* 登录链接 */}
                <div className={styles.loginLink}>
                    已有账号？
                    <Link to="/login" className={styles.link}>
                        立即登录
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

export default RegisterPage
