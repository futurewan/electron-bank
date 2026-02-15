/**
 * 任务管理服务
 * 用于追踪和取消长时间运行的任务
 */

// 存储当前被请求停止的批次 ID
const cancelledBatches = new Set<string>()

/**
 * 请求停止指定批次的核销任务
 */
export function requestStop(batchId: string): void {
  console.log(`[Task] 请求停止批次任务: ${batchId}`)
  cancelledBatches.add(batchId)
}

/**
 * 检查任务是否已被取消
 */
export function isStopped(batchId: string): boolean {
  return cancelledBatches.has(batchId)
}

/**
 * 清除停止标记（在任务开始前或彻底结束后调用）
 */
export function clearStopFlag(batchId: string): void {
  cancelledBatches.delete(batchId)
}
