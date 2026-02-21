# PDF Invoice Parse Specification (Modified)

## ADDED Requirements

### Requirement: 使用 Python 脚本解析 PDF 发票
系统 SHALL 使用集成的 Python 脚本和 `pdfplumber` 库对 PDF 发票进行解析，利用版面分析（Layout Analysis）和文本提取（Text Extraction）获取结构化发票数据。

#### Scenario: 版面分析优于正则
- **WHEN** PDF 包含表格线或固定位置的文本块（如购买方/销售方区域）
- **THEN** Python 脚本 SHALL 优先利用坐标位置和表格结构提取字段，而非仅依赖全文本正则匹配

#### Scenario: 自动识别发票类型
- **WHEN** 解析 PDF 文件
- **THEN** Python 脚本 SHALL 自动识别发票类型（增值税电子普通发票/专用发票/全电发票），并根据不同类型的版面特征应用相应的提取策略

## REMOVED Requirements

### Requirement: 从 PDF 元数据提取发票信息
**Reason**: 已被 Python 脚本的综合解析逻辑（含 metadata 和 layout）取代，不再作为独立的优先步骤强制执行。
**Migration**: 逻辑移至 Python `invoice_parser.py` 内部处理。

### Requirement: 从 PDF 文字层正则提取发票信息
**Reason**: `pdf-parse` 的纯文本提取方案已被废弃，替换为基于 layout 的 `pdfplumber` 提取方案。
**Migration**: 逻辑移至 Python `invoice_parser.py` 内部处理。

## MODIFIED Requirements

### Requirement: 批量解析文件夹中的 PDF 发票
系统 SHALL 调用 Python 脚本扫描指定文件夹，识别所有 `.pdf` 文件（排除隐藏文件），并逐个解析提取发票信息。

#### Scenario: 文件夹包含多个 PDF
- **WHEN** 用户指定的文件夹中包含 5 个 PDF 文件
- **THEN** 系统 SHALL 启动 Python 进程一次性处理该文件夹，Node.js 主进程接收流式输出并汇总解析结果（包含成功的发票和失败的错误）

#### Scenario: 文件夹中无 PDF 文件
- **WHEN** 文件夹中不包含任何 .pdf 文件
- **THEN** 系统 SHALL 返回 `success: false`，并在错误信息中说明"文件夹中没有 PDF 文件"

#### Scenario: 解析过程中报告进度
- **WHEN** 正在批量解析 10 个 PDF 文件中的第 3 个
- **THEN** Python 脚本 SHALL 输出进度事件，系统 SHALL 捕获并通过 `onProgress` 回调报告当前进度：`(3, 10, 'invoice_003.pdf')`

### Requirement: 解析结果导出为 Excel
系统 SHALL 使用 Python `pandas` 和 `openpyxl` 库将解析后的发票数据导出为格式化的 Excel 文件（`.xlsx`）。

#### Scenario: 导出成功
- **WHEN** 10 张发票解析完成（含 1 张重复被跳过）
- **THEN** 系统 SHALL 调用 Python 脚本生成 Excel 文件，包含 9 行数据（不含重复项），文件名格式为 `发票清单_YYYY-MM-DD.xlsx`，并应用适当的列宽和格式

#### Scenario: 默认输出路径
- **WHEN** 未指定输出路径
- **THEN** 系统 SHALL 将 Excel 文件保存到发票文件夹所在目录
