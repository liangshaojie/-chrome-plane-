<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAnalysisStore } from '@/stores/analysis'
import { useSettingsStore } from '@/stores/settings'
import { usePlaneUrl } from '@/composables/usePlaneUrl'

const analysisStore = useAnalysisStore()
const settingsStore = useSettingsStore()
const { parsedUrl } = usePlaneUrl()

const selectedPath = ref<string | null>(null)

const files = computed(() => analysisStore.changedFiles)
// 已处置（含回看历史时的持久化状态）就锁住按钮
const resolved = computed(() =>
  analysisStore.changeAction === 'committed' ||
  analysisStore.changeAction === 'reverted' ||
  analysisStore.commitStatus === 'committed' ||
  analysisStore.commitStatus === 'reverted'
)

const current = computed(() => {
  if (!selectedPath.value) return files.value[0] ?? null
  return files.value.find((f) => f.path === selectedPath.value) ?? null
})

const diffLines = computed(() => {
  if (!current.value) return []
  let id = 0
  return current.value.diff.split(/\r?\n/).map((text) => {
    let kind: 'add' | 'del' | 'hunk' | 'meta' | 'ctx' = 'ctx'
    if (text.startsWith('+++') || text.startsWith('---') || text.startsWith('diff --git')) kind = 'meta'
    else if (text.startsWith('@@')) kind = 'hunk'
    else if (text.startsWith('+')) kind = 'add'
    else if (text.startsWith('-')) kind = 'del'
    return { id: id++, text, kind }
  })
})

function shortName(p: string): string {
  const parts = p.split('/')
  return parts.length > 2 ? '.../' + parts.slice(-2).join('/') : p
}

async function callChanges(path: 'commit' | 'revert') {
  const url = settingsStore.serverUrl.replace(/\/$/, '')
  if (!url) {
    analysisStore.changeAction = 'error'
    analysisStore.changeMessage = '请填写后端地址'
    return
  }
  // 优先用当前 tab URL 解析，失败则从 analysisStore.issue 回退
  let wsSlug = parsedUrl.value?.workspaceSlug
  let issIdent = parsedUrl.value?.issueIdentifier
  if (!wsSlug || !issIdent) {
    const issue = analysisStore.issue
    if (issue?.identifier) {
      wsSlug = issue.identifier.split('-')[0] || ''
      issIdent = issue.identifier
    }
  }
  if (!wsSlug || !issIdent) {
    analysisStore.changeAction = 'error'
    analysisStore.changeMessage = '未识别到 Plane issue 链接'
    return
  }

  analysisStore.changeAction = path === 'commit' ? 'committing' : 'reverting'
  analysisStore.changeMessage = ''

  try {
    const body: Record<string, unknown> = {
      workspaceSlug: wsSlug,
      issueIdentifier: issIdent,
      title: analysisStore.issue?.title,
    }
    // 没有对应的 history 记录（极少见，比如老数据库 / 测试脚本），就不发该字段
    if (analysisStore.historyRecordId != null) {
      body.historyId = analysisStore.historyRecordId
    }
    const res = await fetch(`${url}/changes/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`)
    }
    if (path === 'commit') {
      analysisStore.changeAction = 'committed'
      analysisStore.reviewUrl = data.reviewUrl || ''
      analysisStore.commitStatus = 'committed'
      const reviewMsg = data.reviewUrl ? '已提交到 Gerrit' : '已提交（未解析到 review 链接）'
      if (data.commentPosted) {
        analysisStore.changeMessage = `${reviewMsg} · 已在 Plane 留评论（AI 标识）`
      } else if (data.commentError) {
        analysisStore.changeMessage = `${reviewMsg} · Plane 评论失败：${data.commentError}`
      } else {
        analysisStore.changeMessage = reviewMsg
      }
    } else {
      analysisStore.changeAction = 'reverted'
      analysisStore.commitStatus = 'reverted'
      analysisStore.changeMessage = '已恢复，代码改动已撤销'
    }
  } catch (err: unknown) {
    analysisStore.changeAction = 'error'
    analysisStore.changeMessage = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <div class="changes-pane">
    <template v-if="files.length">
      <!-- 操作栏 -->
      <div class="action-bar">
        <div class="action-info">
          共 <b>{{ files.length }}</b> 个文件被修改，请审阅后确认是否合并
        </div>
        <div class="action-buttons">
          <button
            class="btn confirm"
            :disabled="resolved || analysisStore.changeAction === 'committing' || analysisStore.changeAction === 'reverting'"
            @click="callChanges('commit')"
          >
            {{ analysisStore.changeAction === 'committing' ? '提交中…' : '确认合并并提交' }}
          </button>
          <button
            class="btn cancel"
            :disabled="resolved || analysisStore.changeAction === 'committing' || analysisStore.changeAction === 'reverting'"
            @click="callChanges('revert')"
          >
            {{ analysisStore.changeAction === 'reverting' ? '恢复中…' : '取消并恢复' }}
          </button>
        </div>
      </div>

      <!-- 状态提示 -->
      <div v-if="analysisStore.changeMessage" :class="['action-status', analysisStore.changeAction]">
        <template v-if="analysisStore.changeAction === 'committed' && analysisStore.reviewUrl">
          ✅ {{ analysisStore.changeMessage }}：
          <a :href="analysisStore.reviewUrl" target="_blank" rel="noopener noreferrer">{{ analysisStore.reviewUrl }}</a>
        </template>
        <template v-else-if="analysisStore.changeAction === 'committed'">✅ {{ analysisStore.changeMessage }}</template>
        <template v-else-if="analysisStore.changeAction === 'reverted'">↩️ {{ analysisStore.changeMessage }}</template>
        <template v-else-if="analysisStore.changeAction === 'error'">⚠️ {{ analysisStore.changeMessage }}</template>
      </div>

      <!-- 文件列表 -->
      <div class="file-list">
        <button
          v-for="f in files"
          :key="f.path"
          :class="['file-chip', current?.path === f.path && 'active']"
          @click="selectedPath = f.path"
          :title="f.path"
        >
          <span class="file-name">{{ shortName(f.path) }}</span>
          <span class="stat">
            <span class="add">+{{ f.additions }}</span>
            <span class="del">-{{ f.deletions }}</span>
          </span>
        </button>
      </div>

      <!-- diff -->
      <div v-if="current" class="diff-view">
        <div class="diff-path">{{ current.path }}</div>
        <pre class="diff-body"><code><template v-for="line in diffLines" :key="line.id"><span :class="['line', line.kind]">{{ line.text }}
</span></template></code></pre>
      </div>
    </template>

    <div v-else class="empty">
      <span class="empty-icon">🗂️</span>
      <p>暂无代码改动</p>
      <p class="empty-sub">Agent 修改代码后，这里会展示 diff 供你确认</p>
    </div>
  </div>
</template>

<style scoped>
.changes-pane {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.action-info { font-size: 12px; color: var(--text-muted); }
.action-info b { color: var(--text); }
.action-buttons { display: flex; gap: 8px; }
.btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  font-size: 12px;
  cursor: pointer;
  font-weight: 500;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn.confirm { background: var(--success); color: #fff; border-color: var(--success); }
.btn.cancel { background: var(--bg-secondary); color: var(--text); }

.action-status {
  padding: 8px 16px;
  font-size: 12px;
  border-bottom: 1px solid var(--border);
  word-break: break-all;
  flex-shrink: 0;
}
.action-status.committed { background: rgba(46,160,67,0.12); color: var(--success); }
.action-status.reverted { background: var(--bg-secondary); color: var(--text-muted); }
.action-status.error { background: rgba(248,81,73,0.12); color: var(--error); }
.action-status a { color: var(--primary); }

.file-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.file-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg-secondary);
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  max-width: 260px;
}
.file-chip:hover { color: var(--text); }
.file-chip.active { border-color: var(--primary); color: #fff; }
.file-name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: var(--font-mono, monospace);
}
.stat { display: inline-flex; gap: 4px; font-size: 11px; flex-shrink: 0; }
.stat .add { color: var(--success); }
.stat .del { color: var(--error); }

.diff-view { flex: 1; overflow: auto; display: flex; flex-direction: column; min-height: 0; }
.diff-path {
  padding: 6px 16px;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--text-muted);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  position: sticky; top: 0; z-index: 1;
}
.diff-body {
  margin: 0; padding: 8px 0;
  font-family: var(--font-mono, monospace);
  font-size: 12px; line-height: 1.5; white-space: pre;
}
.diff-body code { display: block; }
.line { display: block; padding: 0 16px; }
.line.add { background: rgba(46,160,67,0.15); color: #9ce5ad; }
.line.del { background: rgba(248,81,73,0.15); color: #ffb4b0; }
.line.hunk { color: var(--primary); margin-top: 4px; }
.line.meta { color: var(--text-muted); }

.empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; gap: 6px; color: var(--text-muted);
}
.empty-icon { font-size: 28px; opacity: 0.4; }
.empty p { font-size: 13px; }
.empty-sub { font-size: 11px !important; opacity: 0.7; }
</style>
