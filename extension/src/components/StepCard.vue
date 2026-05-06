<script setup lang="ts">
import { NCollapseItem, NTag, NText, NScrollbar } from 'naive-ui'
import type { Step, EventKind } from '@/types/events'

defineProps<{ step: Step }>()

const colorMap: Record<EventKind, { color: string; textColor: string }> = {
  sys:   { color: '#e0f2fe', textColor: '#075985' },
  tool:  { color: '#eef2ff', textColor: '#4338ca' },
  think: { color: '#fef3c7', textColor: '#92400e' },
  text:  { color: '#f3f4f6', textColor: '#374151' },
  result:{ color: '#ecfccb', textColor: '#3f6212' },
  usage: { color: '#f3f4f6', textColor: '#6b7280' },
  done:  { color: '#dcfce7', textColor: '#166534' },
  err:   { color: '#fee2e2', textColor: '#b91c1c' },
}

function getColor(kind: EventKind) {
  return colorMap[kind] ?? colorMap.sys
}
</script>

<template>
  <NCollapseItem :name="step.id">
    <template #header>
      <NTag
        size="tiny"
        :color="{ color: getColor(step.kind).color, textColor: getColor(step.kind).textColor }"
        :type="step.kind === 'err' ? 'error' : step.kind === 'done' ? 'success' : 'default'"
        style="margin-right: 8px; flex-shrink: 0"
      >
        {{ step.badge }}
      </NTag>
      <NText depth="1" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
        {{ step.title }}
      </NText>
    </template>
    <NScrollbar v-if="step.body" style="max-height: 240px">
      <pre class="step-body">{{ step.body }}</pre>
    </NScrollbar>
  </NCollapseItem>
</template>

<style scoped>
.step-body {
  margin: 0;
  font-size: 11px;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-all;
  color: #374151;
}
</style>
