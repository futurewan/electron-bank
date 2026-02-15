# 任务清单：付款人映射智能管理增强

## 概览

| 阶段 | 任务数 | 预估时间 | 状态 |
|------|--------|----------|------|
| Phase 1: 智能检测服务 | 2 | 1-2h | ✅ 完成 |
| Phase 2: 提醒弹窗 UI | 2 | 1-2h | ✅ 完成 |
| Phase 3: 快速添加流程 | 2 | 1-2h | ✅ 完成 |
| Phase 4: 映射管理页面 | 3 | 2-3h | ✅ 完成 |
| **总计** | **9** | **5-9h** | ✅ 已交付 |

---

## Phase 1: 智能检测服务

### Task 1.1: 实现代付检测逻辑
- [x] **状态**: 已完成

- **时间**: 45 分钟
- **文件**: `electron/services/mappingService.ts`
- **内容**:
  - `detectProxyPayments(batchId)` 函数
  - `isLikelyPersonName(name)` 判断函数
  - `aggregateByPayer(results)` 聚合函数
  - 排除已有映射和已知公司

---

### Task 1.2: 添加检测 IPC 处理器
- [x] **状态**: 已完成
- **时间**: 30 分钟
- **文件**: 
  - `electron/ipc/channels.ts`
  - `electron/ipc/handlers/reconciliation.ts`
  - `electron/preload.ts`
- **内容**:
  - 添加 `DETECT_PROXY_PAYMENTS` 通道
  - 实现处理器
  - 暴露到 preload

---

## Phase 2: 提醒弹窗 UI

### Task 2.1: 创建提醒弹窗组件
- [x] **状态**: 已完成
- **时间**: 1 小时
- **文件**: `src/components/MappingReminderModal/index.tsx`
- **内容**:
  - 弹窗布局
  - 疑似代付列表表格（付款人、金额、笔数、原因）
  - 三个操作按钮（添加映射、跳过、取消）

---

### Task 2.2: 集成到对账详情页
- [x] **状态**: 已完成
- **时间**: 30 分钟
- **文件**: `src/pages/ReconciliationDetail/index.tsx`
- **内容**:
  - 修改 `handleStartReconciliation` 逻辑
  - 对账前调用检测接口
  - 有疑似代付时显示弹窗
  - 处理跳过和取消操作

---

## Phase 3: 快速添加流程

### Task 3.1: 实现快速添加表单
- [x] **状态**: 已完成
- **时间**: 45 分钟
- **文件**: `src/components/MappingReminderModal/QuickAddForm.tsx`
- **内容**:
  - 逐条添加模式
  - 公司名称下拉建议（从发票销售方匹配）
  - 账户后四位、备注可选输入
  - 保存并继续 / 跳过此条

---

### Task 3.2: 添加批量添加接口
- [x] **状态**: 已完成
- **时间**: 30 分钟
- **文件**: 
  - `electron/services/importService.ts`
  - `electron/ipc/handlers/reconciliation.ts`
  - `electron/preload.ts`
- **内容**:
  - `BATCH_ADD_MAPPINGS` 处理器
  - 批量插入逻辑
  - 返回成功/失败数量

---

## Phase 4: 映射管理页面

### Task 4.1: 创建映射管理页面
- [x] **状态**: 已完成
- **时间**: 1 小时
- **文件**: `src/pages/PayerMappings/index.tsx`
- **内容**:
  - 页面布局
  - 映射列表表格
  - 搜索和筛选功能
  - 分页

---

### Task 4.2: 实现增删改功能
- [x] **状态**: 已完成
- **时间**: 45 分钟
- **文件**: 
  - `src/pages/PayerMappings/AddMappingModal.tsx`
  - `electron/ipc/handlers/reconciliation.ts`
- **内容**:
  - 添加/编辑映射弹窗
  - `ADD_MAPPING` 处理器
  - `UPDATE_MAPPING` 处理器
  - `DELETE_MAPPING` 处理器

---

### Task 4.3: 添加导出功能与路由
- [x] **状态**: 已完成
- **时间**: 30 分钟
- **文件**: 
  - `electron/ipc/handlers/reconciliation.ts`
  - `src/router/index.tsx`
  - `src/components/Layout/Sidebar.tsx`
- **内容**:
  - `EXPORT_MAPPINGS` 处理器（导出 Excel）
  - 添加 `/payer-mappings` 路由
  - 侧边栏添加"映射管理"入口

---

## 完成检查清单

- [x] 智能检测逻辑正确识别个人户名
- [x] 提醒弹窗正常显示和交互
- [x] 快速添加流程顺畅
- [x] 管理页面 CRUD 功能完整
- [x] 导出 Excel 格式正确
- [x] 侧边栏入口可用
- [x] 对账流程集成无冲突

---

**文档状态**: ✅ 已完成
