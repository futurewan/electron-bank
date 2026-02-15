## Context

### 背景

本项目是一个基于 Electron 的桌面应用，用于帮助财务人员自动化银企对账核销流程。应用已具备基础架构：

- **数据层**：SQLite + Drizzle ORM（已实现）
- **配置管理**：electron-store（已实现）
- **AI 服务**：OpenAI API 集成（已实现）
- **IPC 通信**：完整的主进程/渲染进程通信机制（已实现）

### 当前状态

需要在现有基础上实现核心业务功能：银企核销引擎。

### 约束条件

1. **纯本地架构**：所有数据存储在本地，无后端服务
2. **Token 成本控制**：需要最小化 AI API 调用成本
3. **离线优先**：规则匹配部分需支持离线运行
4. **数据隐私**：财务数据敏感，本地处理优先

### 利益相关者

- **财务人员**：主要用户，需要简单易用的界面
- **管理层**：关注效率提升和成本控制

---

## 目标 / 非目标

### 目标

1. **自动化核销**：实现银行流水与发票的自动匹配
2. **智能判断**：处理手续费差异、代付等复杂场景
3. **成本优化**：本地规则处理 85%+ 数据，AI 处理剩余 15%
4. **可解释性**：每笔匹配提供清晰的判断依据
5. **报告生成**：自动输出三种标准格式报告

### 非目标

1. **实时对接银行系统**：不直接连接银行 API
2. **发票 OCR 识别**：不处理扫描件/图片发票
3. **会计凭证生成**：只输出核销结果，不生成记账凭证
4. **多用户协作**：单用户桌面应用

---

## Decisions

### Decision 1: 数据处理流水线架构

**选择**：管道式三阶段处理

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   导入阶段   │───→│   匹配阶段   │───→│   输出阶段   │
│  (Import)   │    │  (Match)    │    │  (Export)   │
└─────────────┘    └─────────────┘    └─────────────┘
```

**阶段说明**：
1. **导入阶段**：解析文件 → 数据清洗 → 存入数据库
2. **匹配阶段**：规则匹配 → AI 匹配 → 结果标记
3. **输出阶段**：生成报告 → 导出文件

**备选方案**：
- 单次内存处理：数据量大时内存压力大，且无法断点续传
- 流式处理：实现复杂度高，1000 条数据级别不需要

**选择理由**：
- 可观测性好（每阶段可查看中间状态）
- 支持断点续传（数据持久化在数据库）
- 便于问题排查

---

### Decision 2: 本地匹配引擎策略

**选择**：三级漏斗匹配

```
          ┌──────────────────────────┐
          │    全部待匹配数据         │ 1000 条
          └────────────┬─────────────┘
                       ↓
    ┌──────────────────────────────────────┐
    │  Level 1: 完美匹配                    │
    │  条件: 金额相等 AND 户名相等          │ → ~600 条命中
    └──────────────────────────────────────┘
                       ↓
    ┌──────────────────────────────────────┐
    │  Level 2: 容差匹配                    │
    │  条件: 金额差≤20 AND 户名相等         │ → ~200 条命中
    └──────────────────────────────────────┘
                       ↓
    ┌──────────────────────────────────────┐
    │  Level 3: 关系映射匹配                │
    │  条件: 金额一致 AND 对应表有关系      │ → ~100 条命中
    └──────────────────────────────────────┘
                       ↓
    ┌──────────────────────────────────────┐
    │  Level 4: AI 批量判断                 │
    │  条件: 上述均未命中                   │ → ~100 条 AI 处理
    └──────────────────────────────────────┘
```

**选择理由**：
- 零成本处理 90% 的数据
- 逻辑清晰，优先级明确
- 便于调试和性能优化

---

### Decision 3: AI 调用策略

**选择**：批量处理 + 结构化输出

```typescript
// 批量调用示例
const prompt = `
你是财务核对专家。请分析以下 ${items.length} 条待匹配数据：

${JSON.stringify(items.map(item => ({
  id: item.id,
  银行户名: item.bankName,
  银行金额: item.bankAmount,
  发票户名: item.invoiceName,
  发票金额: item.invoiceAmount,
  备注信息: item.remarks
})))}

请判断每条数据是否可以匹配，返回 JSON 格式：
[
  { "id": "xxx", "canMatch": true, "reason": "张三是蚂蚁公司员工，属于代付", "confidence": 0.95 },
  ...
]
`
```

**备选方案**：
- 逐条调用：请求次数多，延迟高，总 Token 更多（每次都要发系统提示）
- 流式响应：实现复杂，批量场景不需要

**选择理由**：
- 减少 API 调用次数（100 条数据只需 2-3 次调用）
- 复用系统提示，节省 Token
- 结构化输出便于程序处理

---

### Decision 4: 文件解析策略

**选择**：优先 Excel，PDF 使用 AI 提取

| 文件类型 | 解析方式 | 说明 |
|---------|---------|------|
| Excel (.xlsx/.xls) | `xlsx` 库直接解析 | 可靠、快速 |
| CSV (.csv) | `csv-parser` 库 | 可靠、快速 |
| 电子 PDF | AI 提取 | 避免硬编码布局模板 |

**PDF 解析策略**：
```typescript
// 使用 AI 从 PDF 文本中提取结构化数据
const prompt = `
从以下发票 PDF 文本中提取：
- 发票代码
- 发票号码
- 销售方名称
- 价税合计

PDF 内容：
${pdfText}

返回 JSON 格式...
`
```

**选择理由**：
- PDF 格式多样（数电票、老版税控）
- AI 理解能力强，无需维护多套解析模板
- 对于发票数量少的场景，Token 成本可接受

---

### Decision 5: 数据模型设计

**新增表结构**：

```sql
-- 核销批次（每次核销任务一条记录）
CREATE TABLE reconciliation_batches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,               -- 批次名称
  status TEXT DEFAULT 'pending',    -- pending/processing/completed/failed
  total_bank_count INTEGER,
  total_invoice_count INTEGER,
  matched_count INTEGER DEFAULT 0,
  unmatched_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

-- 银行流水
CREATE TABLE bank_transactions (
  id TEXT PRIMARY KEY,
  batch_id TEXT REFERENCES reconciliation_batches(id),
  transaction_date INTEGER,
  payer_name TEXT,                  -- 对方户名
  payer_account TEXT,               -- 对方账号
  amount REAL NOT NULL,
  remark TEXT,
  status TEXT DEFAULT 'pending',    -- pending/matched/unmatched
  match_id TEXT,                    -- 关联的匹配结果
  created_at INTEGER NOT NULL
);

-- 发票数据
CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  batch_id TEXT REFERENCES reconciliation_batches(id),
  invoice_code TEXT,
  invoice_number TEXT,
  seller_name TEXT,                 -- 销售方名称
  amount REAL NOT NULL,             -- 价税合计
  invoice_date INTEGER,
  status TEXT DEFAULT 'pending',
  match_id TEXT,
  created_at INTEGER NOT NULL
);

-- 付款人对应关系
CREATE TABLE payer_mappings (
  id TEXT PRIMARY KEY,
  person_name TEXT NOT NULL,        -- 个人姓名
  company_name TEXT NOT NULL,       -- 对应公司
  account_suffix TEXT,              -- 账号尾号（可选）
  remark TEXT,                      -- 备注说明
  source TEXT,                      -- 来源（手动/AI提取）
  created_at INTEGER NOT NULL
);

-- 匹配结果
CREATE TABLE match_results (
  id TEXT PRIMARY KEY,
  batch_id TEXT REFERENCES reconciliation_batches(id),
  bank_id TEXT REFERENCES bank_transactions(id),
  invoice_id TEXT REFERENCES invoices(id),
  match_type TEXT NOT NULL,         -- perfect/tolerance/proxy/ai
  reason TEXT,                      -- 匹配原因说明
  confidence REAL,                  -- AI 置信度（0-1）
  amount_diff REAL,                 -- 金额差异
  created_at INTEGER NOT NULL
);
```

---

### Decision 6: 前端页面结构

**页面流程**：

```
┌─────────────────────────────────────────────────────────────┐
│                     核销主页面                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ 1. 导入数据 │→│ 2. 执行匹配 │→│ 3. 查看结果 │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Step 1: 导入数据                                     │  │
│  │  [选择银行流水] [选择发票] [选择对应表]              │  │
│  │                                                       │  │
│  │  预览：                                               │  │
│  │  ┌─────────────────────────────────────────────────┐ │  │
│  │  │ 银行流水：1,234 条 | 发票：1,456 条             │ │  │
│  │  │ 对应关系：45 条                                  │ │  │
│  │  └─────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Step 2: 执行匹配                                     │  │
│  │  [开始核销]                                          │  │
│  │                                                       │  │
│  │  进度：                                               │  │
│  │  ████████████░░░░░░░░ 60%                            │  │
│  │  Level 1: 600/1000 | Level 2: 180/400 | AI: 处理中   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Step 3: 查看结果                                     │  │
│  │                                                       │  │
│  │  📊 完美匹配: 600 | 容差匹配: 180 | 代付匹配: 95    │  │
│  │  ⚠️ 异常: 125                                        │  │
│  │                                                       │  │
│  │  [导出入账凭证] [导出可解释性报告] [导出异常报告]   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Risks / Trade-offs

### Risk 1: PDF 解析准确性
**风险**：不同格式的电子发票可能导致 AI 提取失败
**缓解**：
- 优先推荐用户使用 Excel 格式
- PDF 解析结果提供人工确认界面
- 记录解析失败案例，持续优化 prompt

### Risk 2: AI 服务不可用
**风险**：网络问题或 API 限流导致 AI 匹配失败
**缓解**：
- 本地规则优先，可完成 85% 工作
- AI 失败的数据标记为"待人工确认"
- 支持重试机制

### Risk 3: 同名同姓误匹配
**风险**：多个"张三"可能导致错误的代付匹配
**缓解**：
- 引入账号尾号作为辅助校验
- AI 判断时要求提供置信度
- 低置信度（<0.8）标记为"需确认"

### Risk 4: 数据量超预期
**风险**：单次核销数据量过大（>10000 条）
**缓解**：
- 分批处理机制
- 进度条显示处理状态
- 数据库索引优化查询性能

---

## Open Questions

1. **发票 PDF 格式种类**：需要收集实际发票样本，测试 AI 提取效果
2. **历史数据迁移**：是否需要导入历史核销记录？
3. **对应表维护**：AI 提取的关系映射是否需要人工审核后再使用？
4. **报告模板**：输出的 Excel 报告是否需要自定义模板？
