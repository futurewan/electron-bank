## 1. 配置模型重构（后端基础）

- [x] 1.1 修改 `electron/config/store.ts`：将 `bankStatementFolder`、`invoiceFolder`、`archiveFolder` 替换为 `workspaceFolder: string`，更新 AppConfig 接口、schema 验证和默认值
- [x] 1.2 新增工作目录路径工具函数：在 `electron/utils/paths.ts` 或新建 `electron/utils/workspacePaths.ts`，提供 `getInvoicePath(root)`、`getBankStatementPath(root)`、`getArchivePath(root)` 常量拼接函数
- [x] 1.3 更新 `electron/ipc/handlers/config.ts`：适配新的 `workspaceFolder` 配置字段，确保 `getAll` 和 `set` 正常工作

## 2. 文件夹自动结构服务（后端核心）

- [x] 2.1 重构 `electron/services/folderService.ts`：新增 `initWorkspaceStructure(rootPath: string)` 函数，在根目录下自动创建 `00归档`、`01发票`、`02银行流水` 三个子文件夹（已存在则跳过）
- [x] 2.2 新增 `getNextArchiveDir(archivePath: string)` 函数：扫描 `00归档` 目录，解析已有的 `YYYYMMDD-N` 文件夹名称，返回下一个归档目录路径（取当天最大序号 +1）
- [x] 2.3 新增 `createArchiveSubDirs(archiveDirPath: string)` 函数：在归档目录内创建 `发票`、`银行流水`、`AI比对报告` 三个子文件夹
- [x] 2.4 新增 `validateWorkspace(rootPath: string)` 函数：检查工作目录及子目录是否存在，不存在时自动重建并返回重建标记
- [x] 2.5 注册新 IPC 通道 `electron.folder.initStructure`：调用 `initWorkspaceStructure`，在 `electron/ipc/handlers/file.ts` 或新建 `electron/ipc/handlers/folder.ts` 中注册

## 3. 归档服务重构（后端核心）

- [x] 3.1 重构 `electron/services/archiveService.ts`：修改 `archiveBatch` 函数，从 `workspaceFolder` 读取配置，使用 `getNextArchiveDir` 生成归档目录，用 `createArchiveSubDirs` 创建子文件夹
- [x] 3.2 更新文件移动逻辑：将 `01发票` 中的文件移动到 `{archiveDir}/发票/`，`02银行流水` 中的文件移动到 `{archiveDir}/银行流水/`，保持 try-catch 逐文件处理
- [x] 3.3 在对账完成流程中集成自动归档：修改 `electron/services/reconciliationService.ts`，在对账完成后自动调用归档（先生成报告，再移动源文件）

## 4. 报告生成服务重构（后端核心）

- [x] 4.1 修改 `reportService.ts` 中 `generateAutoEntryReport`：更新 Excel 模板为双行合并表头格式（序号、交易日期、银行流水信息(资金流)[跨2列]、关联单据信息(业务流)[跨2列]、核销结果(AI产出)[跨2列]），数据来源为所有 matchType 的成功匹配记录
- [x] 4.2 修改 `reportService.ts` 中 `generateExplainableReport`：更新 Excel 模板为 5 列（关联序号、AI匹配逻辑(Reasoning Chain)、证据链(Evidence)、置信度、状态），数据来源为 tolerance/proxy/ai 类型的匹配记录
- [x] 4.3 修改 `reportService.ts` 中 `generateExceptionReport`：更新 Excel 模板为 5 列（风险等级[含emoji]、异常类型、银行流水详情、AI诊断分析、AI建议操作），数据来源为异常检测结果
- [x] 4.4 修改报告命名逻辑：从当前命名改为 `{YYYYMMDD}-{N}{报告类型名}.xlsx` 格式，序号与归档文件夹序号一致
- [x] 4.5 修改报告输出目录：从应用内部导出目录改为 `00归档/{YYYYMMDD-N}/AI比对报告/` 目录
- [x] 4.6 修改 `generateReports` 入口函数：根据数据有无条件性生成报告（无数据的类型不生成对应文件）
- [x] 4.7 在对账完成流程中集成自动报告生成：修改 `reconciliationService.ts`，在对账完成后自动调用 `generateReports`，报告写入归档目录后再执行文件转存

## 5. 首页 UI 简化（前端）

- [x] 5.1 修改 `src/pages/Home/index.tsx`：放大「开始对账」按钮样式，移除 `<Plus>` 图标
- [x] 5.2 移除「导入付款人映射」按钮及 `handleImportMappings` 函数和相关 `Users` 图标导入
- [x] 5.3 移除数据统计模块：删除 `statsCards` 数组定义和 `statsSection` 的整个 JSX 区域，以及相关的 `stats` 状态和 `Statistic` 组件导入
- [x] 5.4 将「待完成任务」改为「已完成任务」：过滤条件从 `b.status !== 'completed'` 改为 `b.status === 'completed'`，标题改为「已完成任务」
- [x] 5.5 移除任务卡片中的状态标签（status 颜色和文字逻辑）
- [x] 5.6 更新 `handleCreateBatch`：适配新的单根路径配置，检查 `workspaceFolder` 而非 `bankStatementFolder/invoiceFolder`
- [x] 5.7 重构 `FolderConfigModal` 调用：传递新配置模型，弹窗改为选择单一工作目录
- [x] 5.8 清理 `Home.module.scss`：移除 `statsSection`、`statsCard`、`statsIcon` 等不再使用的样式

## 6. FolderConfigModal 组件重构（前端）

- [x] 6.1 修改 `src/components/FolderConfigModal/index.tsx`：将 3 个文件夹选择改为 1 个「选择工作目录」入口，移除 `showBank`/`showInvoice`/`showArchive` 属性
- [x] 6.2 修改保存逻辑：选择文件夹后调用 `electron.folder.initStructure(rootPath)` 初始化子目录结构，然后保存 `workspaceFolder` 到配置
- [x] 6.3 更新所有调用方（Home、Reconciliation、ReconciliationDetail、Settings）适配新的组件 Props

## 7. 对账管理页面简化（前端）

- [x] 7.1 修改 `src/pages/Reconciliation/index.tsx`：移除 `getStatusTag` 函数和批次卡片中的状态标签 `<Tag>`
- [x] 7.2 移除「创建批次」按钮、`createModalVisible` 状态、新建批次弹窗 `<Modal>` 及 `handleCreateBatch` 函数
- [x] 7.3 移除 `newBatchName` 状态和相关输入逻辑
- [x] 7.4 清理不再使用的导入（`Plus`、`Modal`、`Input` 等）

## 8. 对账详情页重构（前端）

- [x] 8.1 修改 `src/pages/ReconciliationDetail/index.tsx` 匹配统计模块：将 4 个 `<Statistic>` 合并为 3 个（完美匹配、其中可解释性、异常情况），前端做聚合计算
- [x] 8.2 保留剩余银行流水和剩余发票统计，不变
- [x] 8.3 移除右侧「批次信息」卡片（`<Card title="批次信息">`），包括 `<Descriptions>` 及批次ID、创建时间等内容
- [x] 8.4 重构异常检测结果表格：将 `<Table>` 的列定义改为 5 列（风险等级、异常类型、银行流水详情、AI诊断分析、AI建议操作），风险等级添加 emoji 前缀
- [x] 8.5 新增报告列表展示区域：展示自动生成的报告文件名列表，每个报告旁配「下载」按钮（调用 `electron.app.showInFolder` 定位文件）
- [x] 8.6 更新报告列表数据加载逻辑：从数据库查询该批次的报告记录，展示文件名和路径

## 9. 设置页面更新（前端）

- [x] 9.1 修改 `src/pages/Settings/index.tsx`：更新文件夹配置区域，将 3 个文件夹字段替换为 1 个「工作目录」字段和「重置工作目录」按钮
- [x] 9.2 重置按钮逻辑：弹出文件夹选择对话框，选择后调用 `initStructure` 初始化并保存新路径

## 10. 对账启动流程适配（前端）

- [x] 10.1 修改首页「开始对账」按钮流程：检查 `workspaceFolder` → 如未设置弹出选择弹窗 → 如已设置检查目录是否存在 → 目录不存在自动重建并提示 → 目录存在自动扫描 `01发票` 和 `02银行流水` 并启动对账
- [x] 10.2 修改 `Reconciliation` 页面的 `checkFolderConfigAndScan` 函数：适配新的 `workspaceFolder` 配置，扫描路径改为 `workspaceFolder/01发票` 和 `workspaceFolder/02银行流水`
- [x] 10.3 更新 `preload.ts`：如有必要，暴露新的 IPC 通道（`folder.initStructure` 等）给渲染进程

## 11. 集成测试与清理

- [x] 11.1 端到端测试：首次使用 → 选择工作目录 → 放入数据 → 开始对账 → 验证归档目录和报告生成
- [x] 11.2 测试同一天多次对账的序号递增逻辑
- [x] 11.3 测试工作目录被删除后的自动重建和提示逻辑
- [x] 11.4 清理不再使用的代码：移除 `handleImportMappings` 相关后端接口（如不再需要）、旧的 `FolderConfigModal` Props 类型定义等
