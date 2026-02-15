/**
 * 认证相关工具函数
 * @module utils/auth
 */

/**
 * 简单的密码编码（Base64）
 * 注意：仅用于本地演示，生产环境应使用 bcrypt 等加密算法
 */
export function encodePassword(password: string): string {
    return btoa(encodeURIComponent(password))
}

/**
 * 密码解码
 */
export function decodePassword(encoded: string): string {
    return decodeURIComponent(atob(encoded))
}

/**
 * 验证密码是否匹配
 */
export function validatePassword(input: string, storedEncoded: string): boolean {
    return encodePassword(input) === storedEncoded
}

/**
 * 生成唯一用户 ID
 */
export function generateUserId(): string {
    const timestamp = Date.now().toString(36)
    const randomStr = Math.random().toString(36).substring(2, 11)
    return `user_${timestamp}_${randomStr}`
}

/**
 * 验证用户名格式
 * - 长度：3-20 个字符
 * - 只允许字母、数字、下划线
 */
export function validateUsername(username: string): { valid: boolean; message: string } {
    if (!username) {
        return { valid: false, message: '请输入用户名' }
    }
    if (username.length < 3) {
        return { valid: false, message: '用户名至少 3 个字符' }
    }
    if (username.length > 20) {
        return { valid: false, message: '用户名最多 20 个字符' }
    }
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(username)) {
        return { valid: false, message: '用户名只能包含字母、数字、下划线或中文' }
    }
    return { valid: true, message: '' }
}

/**
 * 验证密码强度
 * - 长度：6-32 个字符
 */
export function validatePasswordStrength(password: string): { valid: boolean; message: string } {
    if (!password) {
        return { valid: false, message: '请输入密码' }
    }
    if (password.length < 6) {
        return { valid: false, message: '密码至少 6 个字符' }
    }
    if (password.length > 32) {
        return { valid: false, message: '密码最多 32 个字符' }
    }
    return { valid: true, message: '' }
}

/**
 * 生成默认头像 URL（使用 DiceBear API）
 */
export function generateDefaultAvatar(username: string): string {
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(username)}&backgroundColor=6366f1`
}
