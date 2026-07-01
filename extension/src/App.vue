<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import TopBar from '@/components/TopBar.vue'
import Controls from '@/components/Controls.vue'
import IssueCard from '@/components/IssueCard.vue'
import StatusBar from '@/components/StatusBar.vue'
import TabNav from '@/components/TabNav.vue'
import ProcessLog from '@/components/ProcessLog.vue'
import OutputPane from '@/components/OutputPane.vue'
import ProposalPane from '@/components/ProposalPane.vue'
import ReviewPane from '@/components/ReviewPane.vue'
import { useSettingsStore } from '@/stores/settings'
import { usePlaneUrl } from '@/composables/usePlaneUrl'
import { useAnalysisStore } from '@/stores/analysis'

const settingsStore = useSettingsStore()
const { parsedUrl } = usePlaneUrl()
const analysisStore = useAnalysisStore()
const activeTab = ref('process')
const adoptingId = ref<string | null>(null)

onMounted(() => {
  settingsStore.loadFromStorage()
})

// 收到 Gerrit 提交链接后，自动切到“Gerrit 提交”tab，方便直接查看
watch(
  () => analysisStore.reviewUrl,
  (url) => {
    if (url) activeTab.value = 'review'
  }
)

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

async function adoptProposal(proposal: { title: string; content: string }) {
  if (!parsedUrl.value) return
  adoptingId.value = proposal.title

  const content = `【AI 修改方案 - 已采纳】

## ${proposal.title}

${proposal.content}

---
*由 Plane WorkItem Analyzer AI 分析自动生成*`

  try {
    await postWriteback('/plane/comment', content)
    analysisStore.setWritebackStatus('✓ 方案已发布为评论', 'success')
  } catch (err: unknown) {
    analysisStore.setWritebackStatus(`发布失败：${err instanceof Error ? err.message : String(err)}`, 'error')
  } finally {
    adoptingId.value = null
  }
}
</script>

<template>
  <div class="app">
    <TopBar />
    <Controls />
    <IssueCard />
    <StatusBar />
    <TabNav v-model="activeTab" />
    <div class="pane-container">
      <ProcessLog v-show="activeTab === 'process'" />
      <OutputPane v-show="activeTab === 'result'" />
      <ProposalPane
        v-show="activeTab === 'proposal'"
        @adopt="adoptProposal"
      />
      <ReviewPane v-show="activeTab === 'review'" />
    </div>
    <div
      v-if="analysisStore.writebackStatus"
      :class="['status-bar', analysisStore.writebackStatusKind]"
    >
      {{ analysisStore.writebackStatus }}
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
}
.pane-container {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.status-bar {
  padding: 8px 16px;
  font-size: 12px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  flex-shrink: 0;
}
.status-bar.success {
  color: var(--success);
}
.status-bar.error {
  color: var(--error);
}
</style>
