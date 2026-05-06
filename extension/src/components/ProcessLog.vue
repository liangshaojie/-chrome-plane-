<script setup lang="ts">
import StepCard from './StepCard.vue'
import { useAnalysisStore } from '@/stores/analysis'

const analysisStore = useAnalysisStore()
</script>

<template>
  <div class="process-log">
    <div v-if="analysisStore.steps.length === 0" class="empty">暂无日志</div>
    <StepCard
      v-for="step in analysisStore.steps"
      :key="step.id"
      :step="step"
    />
  </div>
</template>

<style scoped>
.process-log {
  flex: 1;
  overflow-y: auto;
}
.empty {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
