<script setup lang="ts">
import { ref, watch } from 'vue'
import { useHistoryStore } from '@/stores/history'
import { useSettingsStore } from '@/stores/settings'
import { useAnalysisStore } from '@/stores/analysis'
import { USER_ROLES, type UserRole } from '@/stores/analysis'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const historyStore = useHistoryStore()
const settingsStore = useSettingsStore()
const analysisStore = useAnalysisStore()

// 二次确认删除的记录 id
const confirmDeleteId = ref<number | null>(null)

// 打开模态时拉取列表
watch(
  () => props.open,
  async (o) => {
    if (o) {
      confirmDeleteId.value = null
      await historyStore.fetchList(settingsStore.serverUrl)
    }
  }
)

function close() {
  emit('close')
}

// 打开某条历史：加载详情并还原主视图，然后关闭模态
async function openRecord(id: number) {
  const ok = await historyStore.loadRecord(settingsStore.serverUrl, id)
  if (ok) close()
}

async function removeRecord(id: number) {
  await historyStore.deleteRecord(settingsStore.serverUrl, id)
  confirmDeleteId.value = null
}

function roleLabel(r: string | null): string {
  if (!r) return ''
  const found = USER_ROLES.find((x) => x.value === (r as UserRole))
  return found ? found.label : r
}

function statusText(s: string): string {
  return ({ done: '完成', error: '出错', aborted: '中断' } as Record<string, string>)[s] ?? s
}

function statusClass(s: string): string {
  return `status-${s}`
}

// 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前，否则回退日期
function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return iso
  const diff = Date.now() - t
  if (diff < 0) return iso.slice(0, 16).replace('T', ' ')
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  return iso.slice(0, 10)
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function fmtCost(c: number | null): string {
  if (c == null) return ''
  return `$${c.toFixed(4)}`
}
</script>

<template>
  <div v-if="open" class="history-backdrop" @click.self="close">
    <div class="history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <div class="history-header">
        <div class="history-title-wrap">
          <h2 id="history-title">历史分析记录</h2>
          <span v-if="historyStore.total > 0" class="count">共 {{ historyStore.total }} 条</span>
        </div>
        <div class="history-header-actions">
          <button
            v-if="!historyStore.loading && historyStore.list.length > 0"
            class="refresh-btn"
            title="刷新"
            @click="historyStore.fetchList(settingsStore.serverUrl)"
          >
            ↻ 刷新
          </button>
          <button class="close-btn" aria-label="关闭" @click="close">×</button>
        </div>
      </div>

      <div class="history-body">
        <div v-if="historyStore.loading" class="status">加载中…</div>
        <div v-else-if="historyStore.error" class="status error">{{ historyStore.error }}</div>
        <div v-else-if="historyStore.list.length === 0" class="empty">
          <span class="empty-icon">🗂️</span>
          <p>暂无历史记录</p>
          <span class="empty-hint">分析完成的结果会自动保存到这里</span>
        </div>
        <ul v-else class="history-list">
          <li v-for="r in historyStore.list" :key="r.id" class="history-item">
            <button class="item-main" @click="openRecord(r.id)">
              <div class="item-top">
                <span class="item-ident">{{ r.issue_identifier ?? '（无标识）' }}</span>
                <span :class="['item-status', statusClass(r.status)]">{{ statusText(r.status) }}</span>
              </div>
              <div class="item-title" :title="r.issue_title ?? ''">
                {{ r.issue_title ?? '（无标题）' }}
              </div>
              <div class="item-meta">
                <span>{{ relTime(r.created_at) }}</span>
                <span v-if="r.role" class="dot">·</span>
                <span v-if="r.role">{{ roleLabel(r.role) }}</span>
                <span v-if="r.duration_ms != null" class="dot">·</span>
                <span v-if="r.duration_ms != null">{{ fmtDuration(r.duration_ms) }}</span>
                <span v-if="r.cost_usd != null" class="dot">·</span>
                <span v-if="r.cost_usd != null">{{ fmtCost(r.cost_usd) }}</span>
                <span v-if="r.num_turns != null" class="dot">·</span>
                <span v-if="r.num_turns != null">{{ r.num_turns }} 轮</span>
              </div>
            </button>
            <div class="item-actions">
              <template v-if="confirmDeleteId !== r.id">
                <button
                  class="del-btn"
                  title="删除"
                  @click.stop="confirmDeleteId = r.id"
                >
                  🗑
                </button>
              </template>
              <template v-else>
                <button class="del-confirm" @click.stop="removeRecord(r.id)">确认删除</button>
                <button class="del-cancel" @click.stop="confirmDeleteId = null">取消</button>
              </template>
            </div>
          </li>
        </ul>
      </div>

      <div class="history-footer">
        <span v-if="analysisStore.isHistoryView" class="viewing-hint">
          正在查看历史记录 · 点击「开始分析」即退出回看
        </span>
        <button class="btn-primary" @click="close">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
}
.history-dialog {
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-card, #1f2937);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  animation: dialog-in 0.18s ease-out;
}
@keyframes dialog-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.history-title-wrap {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.history-header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
}
.count {
  font-size: 11px;
  color: var(--text-muted);
}
.history-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.refresh-btn {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}
.refresh-btn:hover {
  color: var(--primary);
  border-color: rgba(59, 130, 246, 0.3);
}
.close-btn {
  border: none;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0 4px;
}
.close-btn:hover {
  color: #fff;
}

.history-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 10px 4px;
}

.status {
  padding: 32px 0;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}
.status.error {
  color: var(--danger, #f87171);
}

.empty {
  padding: 40px 0;
  text-align: center;
  color: var(--text-muted);
}
.empty-icon {
  font-size: 36px;
  display: block;
  margin-bottom: 8px;
  opacity: 0.6;
}
.empty p {
  margin: 0;
  font-size: 13px;
}
.empty-hint {
  font-size: 11px;
  opacity: 0.7;
}

.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.history-item {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  transition: border-color 0.15s, background 0.15s;
  overflow: hidden;
}
.history-item:hover {
  border-color: rgba(59, 130, 246, 0.35);
}

.item-main {
  flex: 1;
  min-width: 0;
  text-align: left;
  background: transparent;
  border: none;
  padding: 10px 12px;
  cursor: pointer;
  color: inherit;
  font: inherit;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.item-main:hover {
  background: var(--primary-bg, rgba(59, 130, 246, 0.08));
}

.item-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.item-ident {
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  font-weight: 700;
  color: var(--primary);
}
.item-status {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 8px;
}
.status-done {
  background: var(--success-bg, rgba(104, 211, 145, 0.15));
  color: var(--success, #68d3a0);
}
.status-error {
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
}
.status-aborted {
  background: rgba(148, 163, 184, 0.15);
  color: var(--text-muted);
}

.item-title {
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  font-size: 11px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 3px;
}
.item-meta .dot {
  opacity: 0.5;
  margin: 0 1px;
}

.item-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 8px 8px 0;
  flex-shrink: 0;
}
.del-btn {
  border: none;
  background: transparent;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 5px;
  opacity: 0.55;
  transition: opacity 0.15s, background 0.15s;
}
.del-btn:hover {
  opacity: 1;
  background: rgba(248, 113, 113, 0.12);
}
.del-confirm {
  padding: 4px 8px;
  border: 1px solid #f87171;
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
  font-size: 11px;
  border-radius: 5px;
  cursor: pointer;
}
.del-confirm:hover {
  background: #f87171;
  color: #fff;
}
.del-cancel {
  padding: 4px 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-muted);
  font-size: 11px;
  border-radius: 5px;
  cursor: pointer;
}

.history-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 18px 14px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
.viewing-hint {
  font-size: 11px;
  color: var(--primary);
}
.btn-primary {
  padding: 6px 18px;
  border-radius: 6px;
  border: 1px solid var(--primary);
  background: var(--primary);
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: filter 0.15s;
  margin-left: auto;
}
.btn-primary:hover {
  filter: brightness(1.08);
}
</style>
