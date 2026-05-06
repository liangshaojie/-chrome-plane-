<script setup lang="ts">
import { ref } from 'vue'
import type { Step, EventKind } from '@/types/events'

defineProps<{ step: Step }>()
const isOpen = ref(false)

const colorMap: Record<EventKind, { bg: string; color: string }> = {
  sys:   { bg: '#e0f2fe', color: '#075985' },
  tool:  { bg: '#eef2ff', color: '#4338ca' },
  think: { bg: '#fef3c7', color: '#92400e' },
  text:  { bg: '#f3f4f6', color: '#374151' },
  result:{ bg: '#ecfccb', color: '#3f6212' },
  usage: { bg: '#f3f4f6', color: '#6b7280' },
  done:  { bg: '#dcfce7', color: '#166534' },
  err:   { bg: '#fee2e2', color: '#b91c1c' },
}

function getColor(kind: EventKind) {
  return colorMap[kind] ?? colorMap.sys
}
</script>

<template>
  <div class="step-card" :class="{ 'is-error': step.isError }">
    <div class="step-head" @click="isOpen = !isOpen">
      <span
        class="tag"
        :style="{ background: getColor(step.kind).bg, color: getColor(step.kind).color }"
      >{{ step.badge }}</span>
      <span class="step-title">{{ step.title }}</span>
      <span class="step-chevron">{{ isOpen ? '▾' : '▸' }}</span>
    </div>
    <div v-if="isOpen && step.body" class="step-body">
      <pre>{{ step.body }}</pre>
    </div>
  </div>
</template>

<style scoped>
.step-card {
  border-bottom: 1px solid var(--border);
}
.step-card:last-child {
  border-bottom: none;
}
.step-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
}
.step-head:hover {
  background: var(--bg-secondary);
}
.step-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
.step-chevron {
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.step-body {
  padding: 6px 12px 10px;
  background: var(--bg-secondary);
  max-height: 240px;
  overflow-y: auto;
}
.step-body pre {
  margin: 0;
  font-size: 11px;
  font-family: 'SF Mono', Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-all;
  color: #374151;
  line-height: 1.5;
}
.is-error .step-head {
  background: #fef2f2;
}
</style>
