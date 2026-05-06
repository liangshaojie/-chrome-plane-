<script setup lang="ts">
import { computed } from 'vue'
import { useAnalysisStore } from '@/stores/analysis'
import { marked } from 'marked'

const analysisStore = useAnalysisStore()

const rendered = computed(() => {
  if (!analysisStore.outputText) return ''
  return marked.parse(analysisStore.outputText) as string
})
</script>

<template>
  <div class="output-pane">
    <div
      v-if="analysisStore.outputText"
      class="markdown-body"
      v-html="rendered"
    />
    <div v-else class="empty">
      <span class="empty-icon">📋</span>
      <p>暂无分析结果</p>
    </div>
  </div>
</template>

<style scoped>
.output-pane {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
  color: var(--text-muted);
}
.empty-icon {
  font-size: 28px;
  opacity: 0.4;
}
.empty p {
  font-size: 13px;
}
</style>
