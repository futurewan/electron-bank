/**
 * 认证相关类型定义
 * @module types/auth
 */

/** 用户信息（不含敏感数据） */
export interface User {
    id: string
    username: string
    avatar?: string
    createdAt: string
}

/** 存储的用户数据（包含密码，仅用于本地存储） */
export interface StoredUser extends User {
    password: string // Base64 编码，生产环境应使用加密
}

/** 认证状态 */
export interface AuthState {
    user: User | null
    isLoggedIn: boolean
    isLoading: boolean
}

/** 登录表单数据 */
export interface LoginFormData {
    username: string
    password: string
    remember: boolean
}

/** 注册表单数据 */
export interface RegisterFormData {
    username: string
    password: string
    confirmPassword: string
}

/** 认证操作结果 */
export interface AuthResult {
    success: boolean
    message: string
    user?: User
}
