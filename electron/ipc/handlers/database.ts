/**
 * 数据库 IPC 处理器
 * 处理渲染进程的数据库操作请求
 */
import { and, asc, desc, eq, like, sql } from 'drizzle-orm'
import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import {
    aiConversations,
    bills,
    getDatabase,
    reconciliationRecords,
    transactions
} from '../../database'
import { DB_CHANNELS } from '../channels'

// 表名到 schema 的映射
const tableMap = {
  reconciliation_records: reconciliationRecords,
  bills: bills,
  transactions: transactions,
  ai_conversations: aiConversations,
} as const

type TableName = keyof typeof tableMap

/**
 * 查询参数类型
 */
interface QueryParams {
  table: TableName
  filter?: {
    where?: Record<string, any>
    orderBy?: { field: string; direction: 'asc' | 'desc' }
    pagination?: { page: number; pageSize: number }
  }
}

/**
 * 插入参数类型
 */
interface InsertParams {
  table: TableName
  data: Record<string, any>
}

/**
 * 更新参数类型
 */
interface UpdateParams {
  table: TableName
  id: string
  data: Record<string, any>
}

/**
 * 删除参数类型
 */
interface DeleteParams {
  table: TableName
  id: string
}

/**
 * 批量插入参数类型
 */
interface BatchInsertParams {
  table: TableName
  items: Record<string, any>[]
}

/**
 * 处理查询请求
 */
async function handleQuery(_event: IpcMainInvokeEvent, params: QueryParams) {
  const { table, filter } = params
  const db = getDatabase()
  const tableSchema = tableMap[table]
  
  if (!tableSchema) {
    throw new Error(`Unknown table: ${table}`)
  }
  
  try {
    // 构建基础查询
    let query = db.select().from(tableSchema)
    
    // 应用 where 条件
    if (filter?.where) {
      const conditions = Object.entries(filter.where).map(([key, value]) => {
        const column = (tableSchema as any)[key]
        if (!column) return null
        
        if (typeof value === 'string' && value.includes('%')) {
          return like(column, value)
        }
        return eq(column, value)
      }).filter((c): c is NonNullable<typeof c> => c !== null)
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any
      }
    }
    
    // 获取总数
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(tableSchema)
    const total = countResult[0]?.count || 0
    
    // 应用排序
    if (filter?.orderBy) {
      const column = (tableSchema as any)[filter.orderBy.field]
      if (column) {
        const orderFn = filter.orderBy.direction === 'desc' ? desc : asc
        query = query.orderBy(orderFn(column)) as any
      }
    } else {
      // 默认按创建时间倒序
      if ('createdAt' in tableSchema) {
        query = query.orderBy(desc((tableSchema as any).createdAt)) as any
      }
    }
    
    // 应用分页
    const page = filter?.pagination?.page || 1
    const pageSize = filter?.pagination?.pageSize || 50
    const offset = (page - 1) * pageSize
    
    query = query.limit(pageSize).offset(offset) as any
    
    const data = await query
    
    return {
      data,
      total,
      page,
      pageSize,
    }
  } catch (error) {
    console.error('[DB:Query] Error:', error)
    throw error
  }
}

/**
 * 处理插入请求
 */
async function handleInsert(_event: IpcMainInvokeEvent, params: InsertParams) {
  const { table, data } = params
  const db = getDatabase()
  const tableSchema = tableMap[table]
  
  if (!tableSchema) {
    throw new Error(`Unknown table: ${table}`)
  }
  
  try {
    const id = data.id || uuidv4()
    const now = new Date()
    
    const insertData = {
      ...data,
      id,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    }
    
    await db.insert(tableSchema).values(insertData)
    
    return { id }
  } catch (error) {
    console.error('[DB:Insert] Error:', error)
    throw error
  }
}

/**
 * 处理更新请求
 */
async function handleUpdate(_event: IpcMainInvokeEvent, params: UpdateParams) {
  const { table, id, data } = params
  const db = getDatabase()
  const tableSchema = tableMap[table]
  
  if (!tableSchema) {
    throw new Error(`Unknown table: ${table}`)
  }
  
  try {
    // 只有部分表有 updatedAt 字段
    const hasUpdatedAt = 'updatedAt' in tableSchema
    const updateData = hasUpdatedAt 
      ? { ...data, updatedAt: new Date() }
      : { ...data }
    
    await db
      .update(tableSchema)
      .set(updateData as any)
      .where(eq((tableSchema as any).id, id))
    
    return { success: true }
  } catch (error) {
    console.error('[DB:Update] Error:', error)
    throw error
  }
}

/**
 * 处理删除请求
 */
async function handleDelete(_event: IpcMainInvokeEvent, params: DeleteParams) {
  const { table, id } = params
  const db = getDatabase()
  const tableSchema = tableMap[table]
  
  if (!tableSchema) {
    throw new Error(`Unknown table: ${table}`)
  }
  
  try {
    await db
      .delete(tableSchema)
      .where(eq((tableSchema as any).id, id))
    
    return { success: true }
  } catch (error) {
    console.error('[DB:Delete] Error:', error)
    throw error
  }
}

/**
 * 处理批量插入请求
 */
async function handleBatchInsert(_event: IpcMainInvokeEvent, params: BatchInsertParams) {
  const { table, items } = params
  const db = getDatabase()
  const tableSchema = tableMap[table]
  
  if (!tableSchema) {
    throw new Error(`Unknown table: ${table}`)
  }
  
  try {
    const now = new Date()
    const ids: string[] = []
    
    const insertItems = items.map((item) => {
      const id = item.id || uuidv4()
      ids.push(id)
      return {
        ...item,
        id,
        createdAt: item.createdAt || now,
        updatedAt: item.updatedAt || now,
      }
    })
    
    await db.insert(tableSchema).values(insertItems)
    
    return { ids }
  } catch (error) {
    console.error('[DB:BatchInsert] Error:', error)
    throw error
  }
}

/**
 * 注册数据库 IPC 处理器
 */
export function registerDatabaseHandlers(): void {
  ipcMain.handle(DB_CHANNELS.QUERY, handleQuery)
  ipcMain.handle(DB_CHANNELS.INSERT, handleInsert)
  ipcMain.handle(DB_CHANNELS.UPDATE, handleUpdate)
  ipcMain.handle(DB_CHANNELS.DELETE, handleDelete)
  ipcMain.handle(DB_CHANNELS.BATCH_INSERT, handleBatchInsert)
  
  console.log('[IPC] Database handlers registered')
}
