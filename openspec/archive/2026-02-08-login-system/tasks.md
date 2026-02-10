# Tasks: 登录系统

## 概述

本任务清单将登录系统开发拆解为原子化任务，每个任务预计工作量不超过 30 分钟。

---

## Phase 1: 基础设施

### Task 1.1: 创建认证类型定义 ✅
- [x] 创建 `src/types/auth.ts`
- [x] 定义 `User`、`StoredUser`、`AuthState` 接口
- [x] 定义 `LoginFormData`、`RegisterFormData` 接口

**预计时间**: 10 分钟 | **实际时间**: 约 5 分钟

### Task 1.2: 创建认证工具函数 ✅
- [x] 创建 `src/utils/auth.ts`
- [x] 实现 `encodePassword`、`decodePassword` 函数
- [x] 实现 `validatePassword` 函数
- [x] 实现 `generateUserId` 函数

**预计时间**: 15 分钟 | **实际时间**: 约 8 分钟

### Task 1.3: 创建认证状态管理 ✅
- [x] 创建 `src/stores/authStore.ts`
- [x] 实现 `login`、`register`、`logout` 方法
- [x] 实现 `checkAuth` 初始化检查
- [x] 使用 `zustand/persist` 持久化状态

**预计时间**: 30 分钟 | **实际时间**: 约 15 分钟

---

## Phase 2: 页面开发

### Task 2.1: 创建登录页面 ✅
- [x] 创建 `src/pages/Auth/Login/index.tsx`
- [x] 创建 `src/pages/Auth/Login/Login.module.css`
- [x] 实现登录表单（用户名、密码、记住登录）
- [x] 实现登录逻辑和错误提示
- [x] 添加跳转注册链接

**预计时间**: 45 分钟 | **实际时间**: 约 20 分钟

### Task 2.2: 创建注册页面 ✅
- [x] 创建 `src/pages/Auth/Register/index.tsx`
- [x] 创建 `src/pages/Auth/Register/Register.module.css`
- [x] 实现注册表单（用户名、密码、确认密码）
- [x] 实现注册逻辑和验证
- [x] 添加跳转登录链接

**预计时间**: 30 分钟 | **实际时间**: 约 15 分钟

---

## Phase 3: 路由与保护

### Task 3.1: 创建路由保护组件 ✅
- [x] 创建 `src/components/ProtectedRoute/index.tsx`
- [x] 实现未登录重定向到 `/login`
- [x] 实现已登录渲染子组件

**预计时间**: 15 分钟 | **实际时间**: 约 5 分钟

### Task 3.2: 更新路由配置 ✅
- [x] 修改 `src/router/index.tsx`
- [x] 添加 `/login` 和 `/register` 路由
- [x] 使用 `ProtectedRoute` 包裹主布局
- [x] 添加已登录访问登录页的重定向

**预计时间**: 20 分钟 | **实际时间**: 约 10 分钟

---

## Phase 4: 用户界面集成

### Task 4.1: 创建用户信息组件 ✅
- [x] 创建 `src/components/UserInfo/index.tsx`
- [x] 创建 `src/components/UserInfo/UserInfo.module.css`
- [x] 实现用户头像、欢迎语展示
- [x] 实现下拉菜单（个人信息、设置、退出）
- [x] 参考百度网盘 "Hi >" 风格

**预计时间**: 30 分钟 | **实际时间**: 约 15 分钟

### Task 4.2: 更新 Header 组件 ✅
- [x] 修改 `src/components/Layout/Header.tsx`
- [x] 集成 `UserInfo` 组件替换原有头像
- [x] 确保拖动区域保持可用

**预计时间**: 15 分钟 | **实际时间**: 约 5 分钟

### Task 4.3: 更新 Sidebar 组件 ✅
- [x] 修改 `src/components/Layout/Sidebar.tsx`
- [x] 底部添加用户信息区域
- [x] 添加退出登录按钮

**预计时间**: 20 分钟 | **实际时间**: 约 10 分钟

---

## Phase 5: 测试与完善

### Task 5.1: 功能测试 ✅
- [x] 测试注册新用户流程
- [x] 测试登录流程（正确/错误密码）
- [x] 测试"记住登录"功能
- [x] 测试退出登录功能
- [x] 测试路由保护（未登录访问主页）

**预计时间**: 20 分钟 | **实际时间**: 约 10 分钟

### Task 5.2: UI 调优 ✅
- [x] 检查登录页面响应式布局
- [x] 检查动画和过渡效果
- [x] 确保与 S19 设计系统一致
- [x] 确认百度网盘风格的 "Hi >" 样式

**预计时间**: 15 分钟 | **实际时间**: 约 5 分钟

---

## 进度追踪

| Phase | 任务数 | 已完成 | 状态 |
|-------|--------|--------|------|
| Phase 1: 基础设施 | 3 | 3 | ✅ 已完成 |
| Phase 2: 页面开发 | 2 | 2 | ✅ 已完成 |
| Phase 3: 路由与保护 | 2 | 2 | ✅ 已完成 |
| Phase 4: 用户界面集成 | 3 | 3 | ✅ 已完成 |
| Phase 5: 测试与完善 | 2 | 2 | ✅ 已完成 |
| **总计** | **12** | **12** | 🎉 **全部完成** |

---

**预计总工时**: 约 3.5 小时

**实际工时**: 约 1.5 小时

---

## 实现成果

### 新增文件清单

| 文件路径 | 说明 |
|----------|------|
| `src/types/auth.ts` | 认证相关类型定义 |
| `src/utils/auth.ts` | 密码编码、验证、ID 生成工具函数 |
| `src/stores/authStore.ts` | Zustand 认证状态管理 |
| `src/pages/Auth/Login/index.tsx` | 登录页面组件 |
| `src/pages/Auth/Login/Login.module.css` | 登录页面样式 |
| `src/pages/Auth/Register/index.tsx` | 注册页面组件 |
| `src/pages/Auth/Register/Register.module.css` | 注册页面样式 |
| `src/components/ProtectedRoute/index.tsx` | 路由保护组件 |
| `src/components/UserInfo/index.tsx` | 用户信息组件（Header 使用） |
| `src/components/UserInfo/UserInfo.module.css` | 用户信息样式 |

### 修改文件清单

| 文件路径 | 说明 |
|----------|------|
| `src/App.tsx` | 移除全局 Layout，添加 checkAuth |
| `src/router/index.tsx` | 添加认证路由，应用路由保护 |
| `src/pages/Home/index.tsx` | 添加 Layout 包裹 |
| `src/components/Layout/Header.tsx` | 集成 UserInfo 组件 |
| `src/components/Layout/Sidebar.tsx` | 添加底部用户区域 |
| `src/components/Layout/Layout.module.css` | 添加用户区域样式 |

---

## 验收截图

登录后主页截图显示：
- ✅ 顶部右侧 "Hi >" 风格用户信息
- ✅ 侧边栏底部用户头像、用户名、在线状态
- ✅ 退出登录按钮
- ✅ 整体 UI 与百度网盘参考图风格一致
