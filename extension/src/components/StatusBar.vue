<script setup lang="ts">
import { useAnalysisStore } from '@/stores/analysis'

const analysisStore = useAnalysisStore()
</script>

<template>
  <div class="status-bar">
    <div
      v-if="analysisStore.phase === 'analyzing'"
      class="progress-bar"
    />
    <span :class="{ 'text-error': analysisStore.phase === 'error' }">
      {{ analysisStore.statusMessage || '等待分析...' }}
    </span>
  </div>
</template>

<style scoped>
.status-bar {
  padding: 4px 16px 6px;
  min-height: 20px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
}
.progress-bar {
  height: 3px;
  flex: 1;
  background: linear-gradient(90deg, var(--primary) 0%, var(--primary) 50%, transparent 50%);
  background-size: 20px 100%;
  animation: progress 1s linear infinite;
  border-radius: 2px;
  max-width: 100px;
}
@keyframes progress {
  0% { background-position: 0 0; }
  100% { background-position: 20px 0; }
}
</style>
