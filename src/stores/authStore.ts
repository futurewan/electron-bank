/**
 * 认证状态管理
 * 使用 Zustand + persist 实现登录状态持久化
 * @module stores/authStore
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { User, StoredUser, AuthResult } from '../types/auth'
import {
    encodePassword,
    validatePassword,
    generateUserId,
    generateDefaultAvatar,
} from '../utils/auth'

/** 本地存储键名 */
const STORAGE_KEY = 'electron-bank-auth'
const USERS_STORAGE_KEY = 'electron-bank-users'

/** 获取存储的用户列表 */
function getStoredUsers(): StoredUser[] {
    try {
        const data = localStorage.getItem(USERS_STORAGE_KEY)
        return data ? JSON.parse(data) : []
    } catch {
        return []
    }
}

/** 保存用户列表 */
function saveStoredUsers(users: StoredUser[]): void {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users))
}

/** 根据用户名查找用户 */
function findUserByUsername(username: string): StoredUser | undefined {
    const users = getStoredUsers()
    return users.find((u) => u.username.toLowerCase() === username.toLowerCase())
}

/** 认证 Store 接口 */
interface AuthStore {
    // 状态
    user: User | null
    isLoggedIn: boolean
    isLoading: boolean
    rememberedUsername: string

    // 操作
    login: (username: string, password: string, remember: boolean) => Promise<AuthResult>
    register: (username: string, password: string) => Promise<AuthResult>
    logout: () => void
    checkAuth: () => void
    setRememberedUsername: (username: string) => void
    clearError: () => void
}

/** 创建认证 Store */
export const useAuthStore = create<AuthStore>()(
    persist(
        (set, get) => ({
            // 初始状态
            user: null,
            isLoggedIn: false,
            isLoading: false,
            rememberedUsername: '',

            /**
             * 用户登录
             */
            login: async (username, password, remember) => {
                set({ isLoading: true })

                // 模拟网络延迟
                await new Promise((resolve) => setTimeout(resolve, 500))

                const storedUser = findUserByUsername(username)

                if (!storedUser) {
                    set({ isLoading: false })
                    return { success: false, message: '用户不存在' }
                }

                if (!validatePassword(password, storedUser.password)) {
                    set({ isLoading: false })
                    return { success: false, message: '密码错误' }
                }

                // 登录成功，提取用户信息（不含密码）
                const user: User = {
                    id: storedUser.id,
                    username: storedUser.username,
                    avatar: storedUser.avatar,
                    createdAt: storedUser.createdAt,
                }

                set({
                    user,
                    isLoggedIn: true,
                    isLoading: false,
                    rememberedUsername: remember ? username : '',
                })

                return { success: true, message: '登录成功', user }
            },

            /**
             * 用户注册
             */
            register: async (username, password) => {
                set({ isLoading: true })

                // 模拟网络延迟
                await new Promise((resolve) => setTimeout(resolve, 500))

                // 检查用户名是否已存在
                if (findUserByUsername(username)) {
                    set({ isLoading: false })
                    return { success: false, message: '用户名已被使用' }
                }

                // 创建新用户
                const newUser: StoredUser = {
                    id: generateUserId(),
                    username,
                    password: encodePassword(password),
                    avatar: generateDefaultAvatar(username),
                    createdAt: new Date().toISOString(),
                }

                // 保存到本地存储
                const users = getStoredUsers()
                users.push(newUser)
                saveStoredUsers(users)

                // 注册成功后自动登录
                const user: User = {
                    id: newUser.id,
                    username: newUser.username,
                    avatar: newUser.avatar,
                    createdAt: newUser.createdAt,
                }

                set({
                    user,
                    isLoggedIn: true,
                    isLoading: false,
                })

                return { success: true, message: '注册成功', user }
            },

            /**
             * 退出登录
             */
            logout: () => {
                const { rememberedUsername } = get()
                set({
                    user: null,
                    isLoggedIn: false,
                    // 保留记住的用户名
                    rememberedUsername,
                })
            },

            /**
             * 检查认证状态（应用启动时调用）
             */
            checkAuth: () => {
                // persist 中间件会自动恢复状态
                // 这里可以添加额外的验证逻辑
                const { user, isLoggedIn } = get()
                if (isLoggedIn && user) {
                    // 验证用户是否仍然存在
                    const storedUser = findUserByUsername(user.username)
                    if (!storedUser) {
                        set({ user: null, isLoggedIn: false })
                    }
                }
            },

            /**
             * 设置记住的用户名
             */
            setRememberedUsername: (username) => {
                set({ rememberedUsername: username })
            },

            /**
             * 清除错误状态
             */
            clearError: () => {
                set({ isLoading: false })
            },
        }),
        {
            name: STORAGE_KEY,
            storage: createJSONStorage(() => localStorage),
            // 只持久化必要的状态
            partialize: (state) => ({
                user: state.user,
                isLoggedIn: state.isLoggedIn,
                rememberedUsername: state.rememberedUsername,
            }),
        }
    )
)

/**
 * 获取当前用户（便捷方法）
 */
export const getCurrentUser = (): User | null => {
    return useAuthStore.getState().user
}

/**
 * 检查是否已登录（便捷方法）
 */
export const isAuthenticated = (): boolean => {
    return useAuthStore.getState().isLoggedIn
}
