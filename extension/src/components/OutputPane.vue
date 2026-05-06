<script setup lang="ts">
import { useAnalysisStore } from '@/stores/analysis'

const analysisStore = useAnalysisStore()
</script>

<template>
  <div class="output-pane">
    <pre v-if="analysisStore.outputText">{{ analysisStore.outputText }}</pre>
    <div v-else class="empty">暂无分析结果</div>
  </div>
</template>

<style scoped>
.output-pane {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}
.output-pane pre {
  margin: 0;
  font-size: 12px;
  font-family: 'SF Mono', Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text);
  line-height: 1.6;
}
.empty {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
