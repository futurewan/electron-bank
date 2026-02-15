# 规格说明：对账核心（增量修改）

## MODIFIED Requirements

### Requirement: 批次状态管理

系统应管理对账批次的生命周期状态，新增 `unbalanced` 状态表示账目未平。

**状态列表：**
- `pending`: 待处理，刚创建
- `importing`: 导入中
- `matching`: 匹配中
- `unbalanced`: 未平账（存在未匹配项或未处理异常）
- `completed`: 已完成（账目已平）
- `failed`: 失败

#### Scenario: 匹配完成后账目未平
- **WHEN** 系统完成规则匹配
- **AND** 存在未匹配的银行流水或发票（`unmatchedCount > 0`）
- **THEN** 批次状态设置为 `unbalanced`

#### Scenario: 匹配完成后存在未处理异常
- **WHEN** 系统完成规则匹配
- **AND** 存在未处理的异常（`exceptionCount > 0` 且有 `pending` 状态异常）
- **THEN** 批次状态设置为 `unbalanced`

#### Scenario: 账目完全匹配
- **WHEN** 系统完成规则匹配
- **AND** 所有银行流水和发票均已匹配（`unmatchedCount = 0`）
- **AND** 所有异常均已处理（无 `pending` 状态异常）
- **THEN** 批次状态设置为 `completed`

#### Scenario: 禁止手动标记未平账为完成
- **WHEN** 批次状态为 `unbalanced`
- **AND** 用户尝试将状态改为 `completed`
- **THEN** 系统拒绝操作
- **AND** 显示「账目未平，无法标记为完成」提示

#### Scenario: 处理完所有异常后可标记完成
- **WHEN** 批次状态为 `unbalanced`
- **AND** 用户处理完所有未匹配项和异常
- **AND** 系统重新检测发现 `unmatchedCount = 0` 且无 `pending` 异常
- **THEN** 批次状态自动更新为 `completed`
