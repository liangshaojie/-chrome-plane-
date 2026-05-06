<script setup lang="ts">
import { NInput, NButton, NText, NSpace } from 'naive-ui'
import { useAnalysisStore } from '@/stores/analysis'
import { useSettingsStore } from '@/stores/settings'
import { usePlaneUrl } from '@/composables/usePlaneUrl'
import { ref } from 'vue'

const analysisStore = useAnalysisStore()
const settingsStore = useSettingsStore()
const { parsedUrl } = usePlaneUrl()
const loading = ref(false)

function summarizeForComment(fullText: string, maxChars = 300): string {
  if (!fullText) return ''
  const blocks = fullText
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'))
  let head = blocks[0] || fullText.trim()
  head = head
    .replace(/^[-*]\s+/gm, '• ')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
  const oneLine = head.replace(/\s+/g, ' ').trim()
  return oneLine.length > maxChars ? oneLine.slice(0, maxChars) + '…' : oneLine
}

async function postWriteback(path: string, content: string) {
  const url = settingsStore.serverUrl.replace(/\/$/, '')
  if (!url || !parsedUrl.value) throw new Error('后端地址或 issue 未就绪')
  const res = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...parsedUrl.value, content }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) throw new Error(data?.error || `HTTP ${res.status}`)
}

async function updateDescription() {
  const text = analysisStore.writebackText.trim()
  if (!text) return analysisStore.setWritebackStatus('内容为空', 'error')
  loading.value = true
  analysisStore.setWritebackStatus('正在更新 issue 描述…')
  try {
    await postWriteback('/plane/description', text)
    analysisStore.setWritebackStatus('✓ 描述已更新，刷新 Plane 可见', 'success')
  } catch (err: unknown) {
    analysisStore.setWritebackStatus(`更新失败：${err instanceof Error ? err.message : String(err)}`, 'error')
  } finally {
    loading.value = false
  }
}

async function postComment() {
  const text = analysisStore.writebackText.trim()
  if (!text) return analysisStore.setWritebackStatus('内容为空', 'error')
  const summary = summarizeForComment(text)
  const content = `【AI 分析摘要】\n${summary}`
  loading.value = true
  analysisStore.setWritebackStatus(`正在发布评论（${summary.length} 字）…`)
  try {
    await postWriteback('/plane/comment', content)
    analysisStore.setWritebackStatus('✓ 评论已发布，刷新 Plane 可见', 'success')
  } catch (err: unknown) {
    analysisStore.setWritebackStatus(`发布失败：${err instanceof Error ? err.message : String(err)}`, 'error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div v-if="analysisStore.showWriteback" class="writeback">
    <NInput
      v-model:value="analysisStore.writebackText"
      type="textarea"
      :autosize="{ minRows: 4, maxRows: 10 }"
      placeholder="分析结果将在此显示"
    />
    <NSpace style="margin-top: 8px">
      <NButton type="primary" size="small" :loading="loading" @click="updateDescription">
        覆盖描述
      </NButton>
      <NButton size="small" :loading="loading" @click="postComment">
        发布评论
      </NButton>
    </NSpace>
    <NText
      v-if="analysisStore.writebackStatus"
      depth="3"
      class="writeback-status"
      :class="analysisStore.writebackStatusKind"
    >
      {{ analysisStore.writebackStatus }}
    </NText>
  </div>
</template>

<style scoped>
.writeback {
  padding: 12px 16px;
  border-top: 1px solid var(--border-color, #e5e7eb);
}
.writeback-status {
  display: block;
  margin-top: 6px;
  font-size: 12px;
}
.writeback-status.success {
  color: #16a34a;
}
.writeback-status.error {
  color: #dc2626;
}
</style>
