## ADDED Requirements

### Requirement: 从 PDF 元数据提取发票信息
系统 SHALL 在解析 PDF 发票时，优先从 PDF 文件的 `Custom` 元数据中提取发票结构化字段。支持的元数据字段包括：InvoiceNumber、IssueTime、SellerIdNum、TotalAmWithoutTax、TotalTax-includedAmount、TotalTaxAm。

#### Scenario: PDF 包含完整元数据
- **WHEN** PDF 文件的 Custom 元数据包含 InvoiceNumber、IssueTime、TotalAmWithoutTax 等字段
- **THEN** 系统 SHALL 从元数据中提取对应值，并标记 `parseSource` 为 `metadata`

#### Scenario: PDF 元数据为空
- **WHEN** PDF 文件的 Custom 元数据为空或不包含任何发票字段
- **THEN** 系统 SHALL 跳过元数据提取步骤，继续尝试文字层提取

### Requirement: 从 PDF 文字层正则提取发票信息
系统 SHALL 使用 `getText()` API 提取 PDF 全文文本，并通过正则表达式从中提取发票字段。提取字段包括：发票号码、发票代码、开票日期、购买方/销售方名称及税号、金额、税额、价税合计、税率、发票类型、项目名称、价税合计大写。

#### Scenario: 文字层包含完整发票信息
- **WHEN** PDF 文字层包含日期（YYYY年MM月DD日）、20位发票号码、公司名称、金额等信息
- **THEN** 系统 SHALL 通过正则匹配提取所有可识别字段

#### Scenario: 文字层与元数据互补
- **WHEN** 元数据已提取到发票号码和金额，但文字层还包含购买方/销售方名称
- **THEN** 系统 SHALL 合并两个来源的数据（元数据字段优先，文字层补充缺失字段），并标记 `parseSource` 为 `both`

#### Scenario: 文字层为空（图片型 PDF）
- **WHEN** PDF 的 getText() 返回空字符串或仅包含空白字符
- **THEN** 系统 SHALL 标记 `parseSource` 为 `none`（或仅 `metadata`），并将该发票标记为解析失败

### Requirement: 批量解析文件夹中的 PDF 发票
系统 SHALL 支持扫描指定文件夹，识别所有 `.pdf` 文件（排除隐藏文件），并逐个解析提取发票信息。

#### Scenario: 文件夹包含多个 PDF
- **WHEN** 用户指定的文件夹中包含 5 个 PDF 文件
- **THEN** 系统 SHALL 逐个解析所有 5 个文件，返回解析结果列表（包含成功的发票和失败的错误）

#### Scenario: 文件夹中无 PDF 文件
- **WHEN** 文件夹中不包含任何 .pdf 文件
- **THEN** 系统 SHALL 返回 `success: false`，并在错误信息中说明"文件夹中没有 PDF 文件"

#### Scenario: 解析过程中报告进度
- **WHEN** 正在批量解析 10 个 PDF 文件中的第 3 个
- **THEN** 系统 SHALL 通过 `onProgress` 回调报告当前进度：`(3, 10, 'invoice_003.pdf')`

### Requirement: 批次内发票去重
系统 SHALL 在同一次批量解析中，检测并去除重复的发票。去重键规则：优先使用 `invoiceNumber`；若 invoiceNumber 为空，则使用 `sellerName + amount + invoiceDate` 组合作为去重键。

#### Scenario: 同一批次中两个 PDF 解析出相同发票号码
- **WHEN** batch 中 inv_001.pdf 和 inv_005.pdf 均解析出 invoiceNumber = "12345678901234567890"
- **THEN** 系统 SHALL 仅保留 inv_001.pdf 的解析结果，将 inv_005.pdf 标记为重复（`reason: '批次内重复'`），并在 `duplicates` 列表中返回

#### Scenario: 发票号码为空时使用组合键去重
- **WHEN** 两个 PDF 的 invoiceNumber 均为 null，但 sellerName、amount、invoiceDate 完全相同
- **THEN** 系统 SHALL 将后出现的 PDF 标记为重复并跳过

#### Scenario: 发票号码为空且组合键不同
- **WHEN** 两个 PDF 的 invoiceNumber 均为 null，但金额不同
- **THEN** 系统 SHALL 将两者均视为有效发票，不去重

### Requirement: 解析结果导出为 Excel
系统 SHALL 支持将解析后的发票数据导出为 Excel 文件（`.xlsx`），包含持所有提取字段的列，并设置合理的列宽。

#### Scenario: 导出成功
- **WHEN** 10 张发票解析完成（含 1 张重复被跳过）
- **THEN** 系统 SHALL 生成 Excel 文件，包含 9 行数据（不含重复项），文件名格式为 `发票清单_YYYY-MM-DD.xlsx`

#### Scenario: 默认输出路径
- **WHEN** 未指定输出路径
- **THEN** 系统 SHALL 将 Excel 文件保存到发票文件夹所在目录

### Requirement: 解析结果包含去重统计
系统 SHALL 在批量解析的返回结果中包含去重统计信息。

#### Scenario: 返回包含 duplicateCount 和 duplicates
- **WHEN** 批量解析完成
- **THEN** 系统 SHALL 返回结构体包含 `totalFiles`、`successCount`、`duplicateCount`、`failCount` 以及 `duplicates` 详情列表（含 fileName、invoiceNumber、reason）
