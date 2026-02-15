/**
 * 对账记录状态管理
 */
import { create } from 'zustand'
import { recordService } from '../services/database'
import type { NewReconciliationRecord, QueryFilter, ReconciliationRecord } from '../types/database'

interface RecordState {
  // 数据
  records: ReconciliationRecord[]
  total: number
  page: number
  pageSize: number
  
  // 状态
  loading: boolean
  error: string | null
  
  // 缓存时间
  lastFetchTime: number
  
  // 动作
  loadRecords: (filter?: QueryFilter, forceRefresh?: boolean) => Promise<void>
  createRecord: (data: NewReconciliationRecord) => Promise<string | null>
  updateRecord: (id: string, data: Partial<ReconciliationRecord>) => Promise<boolean>
  deleteRecord: (id: string) => Promise<boolean>
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  clearError: () => void
}

// 缓存有效期（5 分钟）
const CACHE_TTL = 5 * 60 * 1000

export const useRecordStore = create<RecordState>((set, get) => ({
  // 初始状态
  records: [],
  total: 0,
  page: 1,
  pageSize: 50,
  loading: false,
  error: null,
  lastFetchTime: 0,

  /**
   * 加载对账记录
   */
  loadRecords: async (filter?: QueryFilter, forceRefresh = false) => {
    const { lastFetchTime, page, pageSize } = get()
    
    // 如果缓存有效且不强制刷新，跳过
    if (!forceRefresh && Date.now() - lastFetchTime < CACHE_TTL) {
      return
    }
    
    set({ loading: true, error: null })
    
    try {
      const result = await recordService.list({
        ...filter,
        pagination: filter?.pagination || { page, pageSize },
      })
      
      set({
        records: result.data,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        loading: false,
        lastFetchTime: Date.now(),
      })
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : '加载失败',
      })
    }
  },

  /**
   * 创建对账记录
   */
  createRecord: async (data: NewReconciliationRecord) => {
    set({ loading: true, error: null })
    
    try {
      const id = await recordService.create(data)
      
      // 重新加载列表
      await get().loadRecords(undefined, true)
      
      return id
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : '创建失败',
      })
      return null
    }
  },

  /**
   * 更新对账记录
   */
  updateRecord: async (id: string, data: Partial<ReconciliationRecord>) => {
    set({ loading: true, error: null })
    
    try {
      const success = await recordService.update(id, data)
      
      if (success) {
        // 更新本地状态
        set((state) => ({
          records: state.records.map((r) =>
            r.id === id ? { ...r, ...data } : r
          ),
          loading: false,
        }))
      }
      
      return success
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : '更新失败',
      })
      return false
    }
  },

  /**
   * 删除对账记录
   */
  deleteRecord: async (id: string) => {
    set({ loading: true, error: null })
    
    try {
      const success = await recordService.delete(id)
      
      if (success) {
        // 从本地状态移除
        set((state) => ({
          records: state.records.filter((r) => r.id !== id),
          total: state.total - 1,
          loading: false,
        }))
      }
      
      return success
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : '删除失败',
      })
      return false
    }
  },

  /**
   * 设置页码
   */
  setPage: (page: number) => {
    set({ page })
    get().loadRecords(undefined, true)
  },

  /**
   * 设置每页数量
   */
  setPageSize: (pageSize: number) => {
    set({ pageSize, page: 1 })
    get().loadRecords(undefined, true)
  },

  /**
   * 清除错误
   */
  clearError: () => {
    set({ error: null })
  },
}))
