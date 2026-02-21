# Python Integration Specification

## ADDED Requirements

### Requirement: Python 环境检测
系统 SHALL 提供检测本地 Python 环境的能力，验证 Python 3.x 及所需依赖库（`pdfplumber`, `pandas`, `openpyxl`）是否已安装。

#### Scenario: 环境检测通过
- **WHEN** 调用 `checkPythonEnvironment()` 且系统已安装 Python 3 和所有依赖
- **THEN** 系统 SHALL 返回 `{ available: true, version: "3.x.x" }`

#### Scenario: 缺少依赖
- **WHEN** 调用 `checkPythonEnvironment()` 且系统未安装 `pdfplumber`
- **THEN** 系统 SHALL 返回 `{ available: false, missing: ["pdfplumber"] }`

### Requirement: 执行 Python 脚本
系统 SHALL 能够通过子进程执行指定的 Python 脚本，并支持 JSON 格式的输入/输出通信。

#### Scenario: 成功执行脚本
- **WHEN** 调用 `runPythonScript("hello.py", { name: "World" })`
- **THEN** 系统 SHALL 启动 Python 进程，将 `{ name: "World" }` 作为 JSON 传入 stdin（或作为参数），并捕获 stdout 中的 JSON 输出 `{ message: "Hello World" }`

#### Scenario: 脚本执行出错
- **WHEN** Python 脚本抛出异常或返回非零退出码
- **THEN** 系统 SHALL 捕获 stderr 信息并抛出包含错误详情的异常

### Requirement: 实时进度反馈
系统 SHALL 支持监听 Python 脚本输出的流式 JSON 事件，以实现长任务的进度报告。

#### Scenario: 接收进度事件
- **WHEN** Python 脚本在 stdout 输出 `{"type": "progress", "current": 1, "total": 10}`
- **THEN** 系统 SHALL 解析该行并触发 `onProgress` 回调
