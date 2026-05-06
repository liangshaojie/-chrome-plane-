<script setup lang="ts">
import { NCollapse, NScrollbar } from 'naive-ui'
import StepCard from './StepCard.vue'
import { useAnalysisStore } from '@/stores/analysis'

const analysisStore = useAnalysisStore()
</script>

<template>
  <NScrollbar style="max-height: 400px">
    <NCollapse v-if="analysisStore.steps.length">
      <StepCard
        v-for="step in analysisStore.steps"
        :key="step.id"
        :step="step"
      />
    </NCollapse>
    <div v-else class="empty">暂无日志</div>
  </NScrollbar>
</template>

<style scoped>
.empty {
  padding: 24px;
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
}
</style>
