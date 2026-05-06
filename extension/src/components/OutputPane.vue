<script setup lang="ts">
import { NScrollbar } from 'naive-ui'
import { useAnalysisStore } from '@/stores/analysis'

const analysisStore = useAnalysisStore()
</script>

<template>
  <NScrollbar style="max-height: 400px">
    <pre v-if="analysisStore.outputText" class="output">{{ analysisStore.outputText }}</pre>
    <div v-else class="empty">暂无分析结果</div>
  </NScrollbar>
</template>

<style scoped>
.output {
  margin: 0;
  padding: 12px 16px;
  font-size: 12px;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-word;
  color: #1f2937;
  line-height: 1.6;
}
.empty {
  padding: 24px;
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
}
</style>
