# 任务清单：对账流程优化

## 概览

| 阶段 | 任务数 | 预估时间 | 状态 |
|------|--------|----------|------|
| Phase 1: 配置存储扩展 | 3 | 1h | ⏳ 待开始 |
| Phase 2: 文件夹扫描服务 | 3 | 1.5h | ⏳ 待开始 |
| Phase 3: 新建对账流程改造 | 4 | 2h | ⏳ 待开始 |
| Phase 4: 状态管理增强 | 3 | 1h | ⏳ 待开始 |
| Phase 5: 归档功能 | 3 | 1.5h | ⏳ 待开始 |
| Phase 6: 代付检测优化 | 2 | 0.5h | ⏳ 待开始 |
| Phase 7: 设置中心 UI | 2 | 1h | ⏳ 待开始 |
| **总计** | **20** | **8.5h** | |

---

## 1. 配置存储扩展

- [x] 1.1 扩展 `AppConfig` 接口，添加 `bankStatementFolder`、`invoiceFolder`、`archiveFolder` 三个可选字符串配置项
  - 文件: `electron/config/store.ts`

- [x] 1.2 在配置 schema 中添加三个新字段的类型定义和默认值
  - 文件: `electron/config/store.ts`

- [x] 1.3 在 preload 中确保新配置项可通过 IPC 读写
  - 文件: `electron/preload.ts`（现有通用接口已支持）

---

## 2. 文件夹扫描服务

- [x] 2.1 创建 `folderService.ts`，实现 `selectFolder()` 函数调用系统文件夹选择对话框
  - 文件: `electron/services/folderService.ts`

- [x] 2.2 实现 `scanExcelFiles(folderPath)` 函数，返回文件夹内所有 `.xlsx` 和 `.xls` 文件列表
  - 文件: `electron/services/folderService.ts`
  - 限制: 仅扫描顶层，最多返回 10 个文件

- [x] 2.3 添加 IPC 通道 `SCAN_FOLDER` 和 `SELECT_FOLDER`，注册处理器
  - 文件: `electron/ipc/channels.ts`, `electron/ipc/handlers/file.ts`

---

## 3. 新建对账流程改造

- [x] 3.1 创建 `FolderConfigModal` 组件，用于引导未配置文件夹的用户
  - 文件: `src/components/FolderConfigModal/index.tsx`
  - 功能: 显示两个输入框选择文件夹，调用 `electron.file.selectFolder` 和 `electron.config.set`

- [x] 3.2 创建 `ImportConfirmModal` 组件，显示扫描到的文件列表供确认
  - 文件: `src/components/ImportConfirmModal/index.tsx`
  - 功能: 展示银行流水和发票文件列表（文件名、大小、时间），确认后执行导入

- [x] 3.3 修改 `ReconciliationList` 页面，点击「新建对账」时执行新流程
  - 文件: `src/pages/Reconciliation/index.tsx` (原 `ReconciliationList`)
  - 流程:
    1. 点击新建 -> 检查配置 (IPC `config.get`)
    2. 若未配置 -> 弹出 `FolderConfigModal` -> 保存配置 -> 重新检查
    3. 若已配置 -> 调用 `scanExcelFiles` -> 弹出 `ImportConfirmModal`
    4. 确认导入 -> 创建批次 -> 循环调用 `importBankTransactions` / `importInvoices` -> 跳转详情页

- [x] 3.4 移除对账详情页中的「导入流水」和「导入发票」按钮
  - 文件: `src/pages/ReconciliationDetail/index.tsx`
  - 说明: 新流程强制自动导入，不再需要手动导入入口（或者保留作为补充，但主要流程变更）

---

## 4. 强制平账与状态管理

- [x] 4.1 扩展数据库 `reconciliation_batches` 表的状态字段，支持 `unbalanced`
  - 说明: 已通过代码逻辑支持，无需修改数据库 schema (status 字段为 string)

- [x] 4.2 修改后端完成逻辑，加入余额校验
  - 文件: `electron/services/reconciliationService.ts`
  - 逻辑: 任务结束时，若 `unmatchedCount > 0` 则状态设为 `unbalanced`，否则设为 `completed`

- [x] 4.3 修改前端展示 `unbalanced` 状态
  - 文件: `src/pages/ReconciliationDetail/index.tsx`
  - 说明: `unbalanced` 状态显示为橙色「未平账」，允许继续执行对账；`completed` 状态为绿色「已完成」，禁止修改按钮灰色不可点击

---

## 5. 自动归档

- [x] 5.1 创建 `archiveService.ts`
  - 功能: `archiveBatch(batchId)`，将源文件移动到配置的归档目录 `archiveFolder/YYYYMM-batchName/`
  - 目录结构: 归档目录下创建 `Bank` 和 `Invoice` 子目录

- [x] 5.2 后端 API 暴露 `archiveBatch`
  - 文件: `electron/ipc/handlers/reconciliation.ts`, `electron/preload.ts`
  - 通道: `reconciliation:archive`

- [x] 5.3 前端详情页添加「归档」按钮
  - 文件: `src/pages/ReconciliationDetail/index.tsx`
  - 逻辑: 仅在 `completed` 或 `unbalanced` 状态下可见，点击调用归档接口，归档成功后状态变为 `archived`文件夹配置，未配置则弹窗选择，已配置则执行归档

---

## 6. 代付检测优化

- [x] 6.1 修改 `isLikelyPersonName()` 函数，收紧规则
  - 文件: `electron/services/mappingService.ts`
  - 变更: 中文字符 2-3 个，名字长度 2-3 字符

- [x] 6.2 添加单元测试验证新规则
  - 文件: `electron/services/__tests__/mappingService.test.ts`
  - 用例: 「张三」通过，「欧阳大海」不通过，「张三公司」不通过

---

## 7. 设置中心 UI

- [x] 7.1 创建「对账文件夹」设置页面
  - 文件: `src/pages/Settings/index.tsx`
  - 包含: 三个文件夹路径显示、三个选择按钮、保存按钮

- [x] 7.2 在设置中心添加「对账文件夹」入口
  - 文件: `src/router/index.tsx`
  - 导航: 在路由中添加 /settings 路径

---

## 完成检查清单

- [x] 新建对账流程自动扫描文件夹
- [x] 未配置文件夹时弹窗引导
- [x] 未平账状态正确显示
- [x] 禁止未平账标记完成
- [x] 归档功能正常工作
- [x] 代付检测规则收紧
- [x] 设置中心可修改文件夹路径

---

**文档状态**: ✅ 已完成
