## Why

当前系统要求用户以 **Excel/CSV** 格式导入发票数据进行对账。但在实际业务中，企业收到的发票绝大多数是 **电子发票 PDF 文件**（增值税专用/普通发票），用户必须手动将 PDF 中的信息整理到 Excel 后才能使用系统，这极大增加了操作成本并容易产生人为录入错误。

系统应当**直接支持 PDF 发票作为一等输入格式**，自动从 PDF 中提取结构化发票数据，并以此参与对账流程，从而真正实现"零人工"智能对账。

## What Changes

### 导入流程重构
- **BREAKING**：发票导入的主要输入格式从 Excel 变更为 **PDF 文件夹**（一个文件夹内包含多张 PDF 发票）
- 系统扫描发票文件夹时，优先检测 PDF 文件；如果文件夹内既有 PDF 又有 Excel，PDF 优先
- 支持批量解析：一次性处理文件夹内所有 PDF 发票
- 保留 Excel 格式作为兼容性后备方案（但不再是推荐路径）

### 解析引擎
- 使用 `pdf-parse` (v2) 库从 PDF 中提取发票信息
- 双层提取策略：**PDF 元数据优先** → **文字层正则匹配兜底**
- 提取字段：发票号码、发票代码、开票日期、购买方/销售方名称及税号、金额、税额、价税合计、税率、项目名称
- 解析结果自动转换为系统 `invoices` 表所需的结构化数据

### 校验逻辑重构
- **BREAKING**：`parseService.ts` 中的 `parseInvoices()` 不再是发票数据的唯一入口
- 新增 PDF 专用校验逻辑：验证 PDF 是否为有效发票（含必要字段：销售方名称 + 金额）
- 校验策略从"Excel 列名映射匹配"变为"PDF 文本/元数据字段提取 + 合法性验证"
- 新增解析质量评分：标记各字段的提取来源（metadata / textlayer / both），方便用户了解解析可信度

### 数据库适配
- `invoices` 表新增字段：
  - `buyerName`（购买方名称）
  - `buyerTaxId`（购买方税号）
  - `sellerTaxId`（销售方税号）
  - `taxAmount`（税额）
  - `taxRate`（税率）
  - `invoiceType`（发票类型）
  - `itemName`（项目/商品名称）
  - `parseSource`（解析来源：metadata / textlayer / both）
  - `sourceFilePath`（源 PDF 文件路径）
- 这些新字段为可选字段，不影响已有数据

### 前端适配
- 导入确认弹窗展示 PDF 文件列表（而非 Excel 文件）
- 解析进度反馈：显示"正在解析第 X/N 张发票..."
- 对账详情页的"导入文件"区域显示 PDF 发票文件而非 Excel

### 中间产物：自动生成 Excel
- 解析完 PDF 后，自动在发票文件夹内生成一份 `发票清单_YYYY-MM-DD.xlsx` 汇总文件
- 该 Excel 作为可审计的中间产物保留，方便用户核验解析结果
- 但对账流程**直接使用 PDF 解析后的结构化数据**，不再依赖 Excel 中转

### 发票去重逻辑
- 新增发票去重机制，防止同一张发票被重复导入
- **去重键**：以 `发票号码 (invoiceNumber)` 作为唯一标识进行去重；若发票号码为空，则使用 `销售方名称 + 金额 + 开票日期` 组合作为去重键
- **批次内去重**：同一次批量解析中，若检测到多个 PDF 解析出相同发票号码，仅保留第一个，后续标记为重复并跳过
- **跨批次去重**：导入前检查数据库中是否已存在相同发票号码的记录（不限于当前批次），若已存在则跳过并提示用户
- **去重结果反馈**：
  - 解析完成后，向用户报告：成功 N 张、重复跳过 M 张、解析失败 K 张
  - 导出的 Excel 汇总文件中不包含被去重跳过的发票
- **前端提示**：若存在被去重的发票，在导入确认弹窗和对账详情页给出明确提示，列出被跳过的文件名和原因

## Capabilities

### New Capabilities
- `pdf-invoice-parse`：PDF 发票解析引擎，支持从 PDF 元数据和文字层提取结构化发票信息，支持批量解析、去重检测和解析质量评估

### Modified Capabilities
- `invoice-import`：发票导入流程从"Excel 列名映射"重构为"PDF 自动解析 → 去重检测 → 结构化入库"，校验逻辑从列名匹配变为字段完整性验证 + 去重校验
- `reconciliation-workflow`：对账工作流的发票扫描环节需适配 PDF 优先策略，扫描逻辑和导入确认流程需要同步更新，导入结果需展示去重统计

## Impact

### 受影响的代码模块
| 模块 | 文件 | 变更类型 |
|------|------|----------|
| 解析服务 | `electron/services/parseService.ts` | 修改：`parseInvoices()` 增加 PDF 分支 |
| 发票解析 | `electron/services/invoiceParseService.ts` | 新增/重构：PDF 解析核心逻辑 + 批次内去重 |
| 导入服务 | `electron/services/importService.ts` | 修改：`importInvoices()` 支持 PDF 解析结果入库 + 跨批次去重查询 |
| 数据库 Schema | `electron/database/schema.ts` | 修改：`invoices` 表新增字段 |
| IPC 通道 | `electron/ipc/channels.ts` | 新增：PDF 扫描/解析/导出通道 |
| IPC 处理器 | `electron/ipc/handlers/reconciliation.ts` | 新增：PDF 相关处理器 |
| Preload | `electron/preload.ts` | 新增：暴露 PDF API 到渲染进程 |
| 前端对账页 | `src/pages/Reconciliation/index.tsx` | 修改：`scanFolders()` PDF 优先扫描 |
| 前端详情页 | `src/pages/ReconciliationDetail/index.tsx` | 修改：展示 PDF 文件列表 |

### 依赖变更
- `pdf-parse` (v2)：新增依赖，用于 PDF 解析
- `xlsx`：保留，用于生成汇总 Excel

### 数据库迁移
- 需要为 `invoices` 表新增 8 个可选字段
- **非破坏性**迁移：新字段均为可选 (`nullable`)，不影响已有数据

### 风险点
- PDF 文字层质量不一：部分扫描件可能无文字层，需降级提示用户
- 正则提取覆盖率：不同公司、不同地区的发票版式差异较大，正则可能未覆盖所有格式
- 去重误判：若发票号码提取失败（为空），回退到组合键去重，存在小概率的误判风险（不同发票恰好同一销售方、同一金额、同一日期）
- 未来可考虑接入 OCR 或 AI 视觉识别作为增强方案
