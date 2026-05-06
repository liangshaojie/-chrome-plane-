<script setup lang="ts">
import { NText, NProgress } from 'naive-ui'
import { useAnalysisStore } from '@/stores/analysis'

const analysisStore = useAnalysisStore()
</script>

<template>
  <div class="status-bar">
    <NProgress
      v-if="analysisStore.phase === 'analyzing'"
      type="line"
      indeterminate
      :show-indicator="false"
      :height="3"
    />
    <NText
      depth="3"
      class="status-text"
      :class="{ error: analysisStore.phase === 'error' }"
    >
      {{ analysisStore.statusMessage || '等待分析...' }}
    </NText>
  </div>
</template>

<style scoped>
.status-bar {
  padding: 4px 16px 6px;
  min-height: 20px;
}
.status-text {
  font-size: 12px;
}
.status-text.error {
  color: #dc2626;
}
</style>
