# Reconciliation Workflow Specification

## Purpose
Define the user workflow for reconciliation, including folder scanning, file format detection, user feedback, and UI interactions.

## Requirements

### Requirement: 发票文件夹扫描策略
系统 SHALL 在扫描发票文件夹时执行 PDF 优先策略：先扫描 Excel/CSV 文件，若无 Excel/CSV 文件，则自动扫描 PDF 文件并触发解析流程。

#### Scenario: 文件夹中仅有 PDF 文件
- **WHEN** 发票文件夹中包含 5 个 .pdf 文件，没有 .xlsx 或 .csv 文件
- **THEN** 系统 SHALL 自动调用 `scanPdfFolder()` 检测到 5 个 PDF，然后调用 `exportInvoicesExcel()` 解析并生成 Excel，最后将生成的 Excel 纳入 invoiceFiles 列表

#### Scenario: 文件夹中有 Excel 文件
- **WHEN** 发票文件夹中已存在 .xlsx 文件
- **THEN** 系统 SHALL 使用现有 Excel 文件进行导入，不触发 PDF 解析流程

#### Scenario: 文件夹中既无 Excel 也无 PDF
- **WHEN** 发票文件夹为空或仅包含非支持格式的文件
- **THEN** 系统 SHALL 弹出确认对话框提示"发票文件夹为空，是否继续？"

#### Scenario: 防止扫描重复执行
- **WHEN** `scanFolders()` 正在执行中，另一次调用被触发（如 React StrictMode 双重调用）
- **THEN** 系统 SHALL 使用 Ref 守卫阻止重复执行，确保确认对话框仅弹出一次

### Requirement: PDF 解析过程中的用户反馈
系统 SHALL 在自动检测到 PDF 发票并开始解析时，向用户展示实时解析状态。

#### Scenario: 显示 PDF 检测提示
- **WHEN** 系统在发票文件夹中发现 PDF 文件并开始解析
- **THEN** 系统 SHALL 显示 loading 提示："检测到 N 个 PDF 发票，正在智能解析..."

#### Scenario: 解析完成提示
- **WHEN** PDF 解析和 Excel 导出全部成功
- **THEN** 系统 SHALL 显示成功提示："PDF 解析完成，已自动生成对账 Excel"

#### Scenario: 解析失败提示
- **WHEN** PDF 解析或 Excel 导出过程出错
- **THEN** 系统 SHALL 显示错误提示，包含具体错误信息

### Requirement: 去重结果展示
系统 SHALL 在导入完成后，向用户展示去重统计信息。

#### Scenario: 存在被去重的发票
- **WHEN** 批量导入结果中 `duplicateCount > 0`
- **THEN** 系统 SHALL 在导入确认弹窗中展示"重复跳过 M 张"，并支持展开查看被跳过的文件列表和原因

#### Scenario: 无重复发票
- **WHEN** 批量导入结果中 `duplicateCount === 0`
- **THEN** 系统 SHALL 不显示任何去重相关提示

### Requirement: 对账详情页展示 PDF 文件
系统 SHALL 在对账详情页的"导入文件"区域，正确展示 PDF 发票文件列表（当输入为 PDF 时）。

#### Scenario: 展示 PDF 文件列表
- **WHEN** 对账批次的发票来源为 PDF 文件夹
- **THEN** 系统 SHALL 在"发票文件"列表中显示各 PDF 文件的名称，使用 🧾 图标前缀

#### Scenario: 展示自动生成的 Excel
- **WHEN** 系统自动生成了汇总 Excel 文件
- **THEN** 该 Excel 文件 SHALL 出现在发票文件列表中，标注为"[自动生成]"
