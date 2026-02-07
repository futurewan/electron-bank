import { create } from 'zustand'

/**
 * 应用全局状态
 */
interface AppState {
    // 侧边栏收缩状态
    sidebarCollapsed: boolean
    setSidebarCollapsed: (collapsed: boolean) => void
    toggleSidebar: () => void

    // 用户信息
    user: {
        name: string
        avatar?: string
    } | null
    setUser: (user: AppState['user']) => void

    // 通知数量
    notificationCount: number
    setNotificationCount: (count: number) => void
}

/**
 * 应用全局 Store
 * 管理全局状态，如侧边栏、用户信息等
 */
export const useAppStore = create<AppState>((set) => ({
    // 侧边栏状态
    sidebarCollapsed: false,
    setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

    // 用户信息
    user: {
        name: '管理员',
    },
    setUser: (user) => set({ user }),

    // 通知数量
    notificationCount: 3,
    setNotificationCount: (count) => set({ notificationCount: count }),
}))
