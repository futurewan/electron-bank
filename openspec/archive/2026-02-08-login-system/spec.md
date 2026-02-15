# Spec: 登录系统

## 1. 概述 (Overview)

本规格说明定义了登录系统的技术实现细节，包括数据结构、组件规格、样式规范等。

---

## 2. 数据结构 (Data Structures)

### 2.1 用户数据模型

```typescript
// src/types/auth.ts

/** 用户信息 */
export interface User {
  id: string
  username: string
  avatar?: string
  createdAt: string
}

/** 存储的用户数据（包含密码） */
export interface StoredUser extends User {
  password: string // Base64 简单编码，生产环境应加密
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
```

### 2.2 本地存储结构

```typescript
// electron-store 存储结构
interface LocalStore {
  users: StoredUser[]           // 用户列表
  currentUserId: string | null  // 当前登录用户 ID
  rememberedUsername: string    // 记住的用户名
}
```

---

## 3. 状态管理 (State Management)

### 3.1 authStore

```typescript
// src/stores/authStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthStore {
  // 状态
  user: User | null
  isLoggedIn: boolean
  isLoading: boolean
  rememberedUsername: string

  // 操作
  login: (username: string, password: string, remember: boolean) => Promise<{ success: boolean; message: string }>
  register: (username: string, password: string) => Promise<{ success: boolean; message: string }>
  logout: () => void
  checkAuth: () => void
  setRememberedUsername: (username: string) => void
}
```

---

## 4. 页面组件规格 (Component Specifications)

### 4.1 登录页面 (LoginPage)

**文件路径**: `src/pages/Auth/Login/index.tsx`

**Props**: 无

**功能**:
- 用户名/密码输入
- "记住登录"复选框
- 登录按钮
- 跳转注册链接
- 错误提示

**UI 结构**:
```tsx
<div className="loginContainer">
  <div className="loginCard">
    <div className="logoSection">
      <img src="/logo.svg" alt="Logo" />
      <h1>AI 对账助手</h1>
      <p>智能对账，轻松管理</p>
    </div>
    
    <Form onFinish={handleLogin}>
      <Form.Item name="username">
        <Input prefix={<User />} placeholder="用户名" />
      </Form.Item>
      <Form.Item name="password">
        <Input.Password prefix={<Lock />} placeholder="密码" />
      </Form.Item>
      <Form.Item name="remember">
        <Checkbox>记住登录</Checkbox>
      </Form.Item>
      <Button type="primary" htmlType="submit" block>
        登 录
      </Button>
    </Form>
    
    <div className="registerLink">
      没有账号？<Link to="/register">立即注册</Link>
    </div>
  </div>
</div>
```

### 4.2 注册页面 (RegisterPage)

**文件路径**: `src/pages/Auth/Register/index.tsx`

**Props**: 无

**功能**:
- 用户名输入（验证唯一性）
- 密码输入
- 确认密码输入
- 注册按钮
- 跳转登录链接

### 4.3 路由保护组件 (ProtectedRoute)

**文件路径**: `src/components/ProtectedRoute/index.tsx`

```tsx
interface ProtectedRouteProps {
  children: React.ReactNode
}

// 如果未登录，重定向到 /login
// 如果已登录，渲染 children
```

### 4.4 用户信息组件 (UserInfo)

**文件路径**: `src/components/UserInfo/index.tsx`

**展示位置**: Header 右侧

**UI 风格（参考百度网盘）**:
```tsx
<div className="userInfo">
  <Avatar src={user.avatar} />
  <span className="greeting">Hi</span>
  <ChevronRight size={16} />
</div>
```

点击后展开下拉菜单，包含：
- 个人信息
- 账户设置
- 退出登录

---

## 5. 路由配置 (Routing)

### 5.1 更新后的路由结构

```typescript
// src/router/index.tsx
const routes = [
  // 公开路由
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  
  // 受保护路由
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <MainLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      // ... 其他页面
    ],
  },
]
```

---

## 6. 样式规范 (Style Guidelines)

### 6.1 登录页面样式

```css
/* 登录容器 - 全屏居中 */
.loginContainer {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 100%);
}

/* 登录卡片 */
.loginCard {
  width: 400px;
  padding: 48px 40px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
}

/* Logo 区域 */
.logoSection {
  text-align: center;
  margin-bottom: 40px;
}

.logoSection h1 {
  font-size: 24px;
  font-weight: 600;
  color: #1E293B;
  margin: 16px 0 8px;
}

.logoSection p {
  font-size: 14px;
  color: #64748B;
}

/* 登录按钮 - 渐变色 */
.loginButton {
  height: 48px;
  border-radius: 8px;
  background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%);
  border: none;
  font-size: 16px;
  font-weight: 500;
}
```

### 6.2 用户信息样式（Header 区域）

```css
/* 用户信息区域 - 参考百度网盘风格 */
.userInfo {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 20px;
  cursor: pointer;
  transition: background 200ms;
}

.userInfo:hover {
  background: #F1F5F9;
}

.greeting {
  font-size: 14px;
  color: #475569;
}
```

---

## 7. 工具函数 (Utilities)

### 7.1 密码编码

```typescript
// src/utils/auth.ts

/** 简单的密码编码（Base64，仅用于本地演示） */
export function encodePassword(password: string): string {
  return btoa(password)
}

/** 密码解码 */
export function decodePassword(encoded: string): string {
  return atob(encoded)
}

/** 验证密码 */
export function validatePassword(input: string, stored: string): boolean {
  return encodePassword(input) === stored
}

/** 生成用户 ID */
export function generateUserId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}
```

---

## 8. 文件清单 (File Checklist)

| 文件路径 | 类型 | 描述 |
|----------|------|------|
| `src/types/auth.ts` | 类型定义 | 认证相关类型 |
| `src/stores/authStore.ts` | 状态管理 | Zustand 认证 Store |
| `src/utils/auth.ts` | 工具函数 | 密码编码、ID 生成 |
| `src/pages/Auth/Login/index.tsx` | 页面组件 | 登录页面 |
| `src/pages/Auth/Login/Login.module.css` | 样式文件 | 登录页面样式 |
| `src/pages/Auth/Register/index.tsx` | 页面组件 | 注册页面 |
| `src/pages/Auth/Register/Register.module.css` | 样式文件 | 注册页面样式 |
| `src/components/ProtectedRoute/index.tsx` | 路由组件 | 路由保护 |
| `src/components/UserInfo/index.tsx` | UI 组件 | 用户信息展示 |
| `src/components/UserInfo/UserInfo.module.css` | 样式文件 | 用户信息样式 |
| `src/router/index.tsx` | 路由配置 | 更新路由（需修改） |
| `src/components/Layout/Header.tsx` | 布局组件 | 集成用户信息（需修改） |
| `src/components/Layout/Sidebar.tsx` | 布局组件 | 底部用户区域（需修改） |

---

## 9. 依赖项 (Dependencies)

无需安装新依赖，使用现有技术栈：
- `zustand` - 状态管理（已安装）
- `react-router-dom` - 路由（已安装）
- `antd` - UI 组件（已安装）
- `lucide-react` - 图标（已安装）
