<script setup lang="ts">
import StepCard from './StepCard.vue'
import { useAnalysisStore } from '@/stores/analysis'

const analysisStore = useAnalysisStore()
</script>

<template>
  <div class="process-log">
    <div v-if="analysisStore.steps.length === 0" class="empty">
      <span class="empty-icon">⚡</span>
      <p>点击「开始分析」启动 AI 分析流程</p>
    </div>
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
  background: var(--bg);
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 10px;
  color: var(--text-muted);
}
.empty-icon {
  font-size: 28px;
  opacity: 0.35;
}
.empty p {
  font-size: 13px;
}
</style>
