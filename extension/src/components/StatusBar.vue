<script setup lang="ts">
import { useAnalysisStore } from '@/stores/analysis'

const analysisStore = useAnalysisStore()
</script>

<template>
  <div class="status-bar">
    <div v-if="analysisStore.phase === 'analyzing'" class="progress-track">
      <div class="progress-fill" />
    </div>
    <span :class="['status-text', analysisStore.phase === 'error' && 'error', analysisStore.phase === 'done' && 'success']">
      {{ analysisStore.statusMessage || '等待分析...' }}
    </span>
  </div>
</template>

<style scoped>
.status-bar {
  padding: 8px 16px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 32px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
}
.progress-track {
  flex: 1;
  max-width: 120px;
  height: 3px;
  background: rgba(255,255,255,0.1);
  border-radius: 2px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  width: 35%;
  background: var(--primary);
  border-radius: 2px;
}
.status-text {
  font-size: 12px;
  color: var(--text-muted);
}
.status-text.error {
  color: var(--error);
}
.status-text.success {
  color: var(--success);
}
</style>
