import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { HistorySummary, HistoryRecord } from '@/types/events'
import { ensureOriginPermission } from '@/utils/permissions'
import { useAnalysisStore } from './analysis'

// 统一去掉末尾斜杠，得到干净的 origin base
function normalize(serverUrl: string): string {
  return serverUrl.replace(/\/$/, '')
}

/**
 * 历史分析记录 store。
 * - fetchList: 拉取摘要列表（轻量，不含事件流/结果正文）
 * - loadRecord: 拉取某条详情并喂给 analysisStore.loadHistoryRecord 还原主视图
 * - deleteRecord: 删除一条，本地列表同步移除
 *
 * 远端后端走 ensureOriginPermission（与 useSSE.startAnalysis 一致），
 * 命中 manifest optional_host_permissions 时由 Chrome 弹窗授权。
 */
export const useHistoryStore = defineStore('history', () => {
  const list = ref<HistorySummary[]>([])
  const total = ref(0)
  const loading = ref(false)
  const error = ref('')

  function setError(e: unknown): string {
    return e instanceof Error ? e.message : String(e)
  }

  // 拉取摘要列表（带 host 权限申请）；成功返回 true
  async function fetchList(serverUrl: string, limit = 50, offset = 0): Promise<boolean> {
    const url = normalize(serverUrl)
    if (!url) {
      error.value = '请填写后端地址'
      return false
    }
    const granted = await ensureOriginPermission(url)
    if (!granted) {
      error.value = '未授权访问该后端地址'
      return false
    }
    loading.value = true
    error.value = ''
    try {
      const res = await fetch(`${url}/history?limit=${limit}&offset=${offset}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      list.value = Array.isArray(data.items) ? data.items : []
      total.value = typeof data.total === 'number' ? data.total : list.value.length
      return true
    } catch (e) {
      error.value = setError(e)
      list.value = []
      total.value = 0
      return false
    } finally {
      loading.value = false
    }
  }

  // 加载某条详情并还原到主视图；成功返回 true
  async function loadRecord(serverUrl: string, id: number): Promise<boolean> {
    const url = normalize(serverUrl)
    if (!url) {
      error.value = '请填写后端地址'
      return false
    }
    const granted = await ensureOriginPermission(url)
    if (!granted) {
      error.value = '未授权访问该后端地址'
      return false
    }
    loading.value = true
    error.value = ''
    try {
      const res = await fetch(`${url}/history/${id}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      useAnalysisStore().loadHistoryRecord(data as HistoryRecord)
      return true
    } catch (e) {
      error.value = setError(e)
      return false
    } finally {
      loading.value = false
    }
  }

  // 删除一条；成功后从本地列表移除，返回是否删除成功
  async function deleteRecord(serverUrl: string, id: number): Promise<boolean> {
    const url = normalize(serverUrl)
    if (!url) {
      error.value = '请填写后端地址'
      return false
    }
    try {
      const res = await fetch(`${url}/history/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `HTTP ${res.status}`)
      }
      list.value = list.value.filter((r) => r.id !== id)
      total.value = Math.max(0, total.value - 1)
      return true
    } catch (e) {
      error.value = setError(e)
      return false
    }
  }

  function clear() {
    list.value = []
    total.value = 0
    error.value = ''
  }

  return { list, total, loading, error, fetchList, loadRecord, deleteRecord, clear }
})
