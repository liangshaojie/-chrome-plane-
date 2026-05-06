<script setup lang="ts">
import { ref } from 'vue'
import type { Step, EventKind } from '@/types/events'

defineProps<{ step: Step }>()
const isOpen = ref(false)

interface ColorDef { bg: string; color: string; border: string }
const colorMap: Record<EventKind, ColorDef> = {
  sys:   { bg: 'var(--info-bg)',     color: 'var(--info)',    border: 'rgba(118,228,247,0.3)' },
  tool:  { bg: 'rgba(167,139,250,0.12)', color: '#c4b5fd', border: 'rgba(167,139,250,0.3)' },
  think: { bg: 'var(--warning-bg)',  color: 'var(--warning)', border: 'rgba(246,173,85,0.3)' },
  text:  { bg: 'rgba(255,255,255,0.04)', color: 'var(--text)', border: 'transparent' },
  result:{ bg: 'var(--success-bg)',  color: 'var(--success)', border: 'rgba(104,211,145,0.3)' },
  usage: { bg: 'rgba(255,255,255,0.04)', color: '#a0aec0', border: 'transparent' },
  done:  { bg: 'var(--success-bg)',  color: 'var(--success)', border: 'rgba(104,211,145,0.3)' },
  err:   { bg: 'var(--error-bg)',    color: 'var(--error)',   border: 'rgba(252,129,129,0.3)' },
}

function getColor(kind: EventKind): ColorDef {
  return colorMap[kind] ?? colorMap.text
}
</script>

<template>
  <div
    class="step-card"
    :class="{ 'is-open': isOpen, 'is-error': step.isError }"
    :style="{ '--step-bg': getColor(step.kind).bg, '--step-color': getColor(step.kind).color, '--step-border': getColor(step.kind).border }"
  >
    <div class="step-head" @click="isOpen = !isOpen">
      <span class="step-dot" />
      <span class="tag" :style="{ background: getColor(step.kind).bg, color: getColor(step.kind).color, border: `1px solid ${getColor(step.kind).border}` }">
        {{ step.badge }}
      </span>
      <span class="step-title">{{ step.title }}</span>
      <span class="step-chevron">{{ isOpen ? '▼' : '▶' }}</span>
    </div>
    <div v-if="isOpen && step.body" class="step-body">
      <pre>{{ step.body }}</pre>
    </div>
  </div>
</template>

<style scoped>
.step-card {
  border-bottom: 1px solid var(--border);
  transition: background 0.1s;
}
.step-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 16px;
  cursor: pointer;
  user-select: none;
  background: var(--step-bg);
  border-left: 3px solid var(--step-border);
  transition: background 0.1s;
}
.step-head:hover {
  background: rgba(255,255,255,0.06);
}
.step-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--step-color);
  flex-shrink: 0;
  opacity: 0.7;
}
.step-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--step-color);
}
.step-chevron {
  font-size: 9px;
  color: var(--text-muted);
  flex-shrink: 0;
  transition: transform 0.2s;
}
.step-card.is-open .step-chevron {
  transform: rotate(0deg);
}
.step-card:not(.is-open) .step-chevron {
  transform: rotate(0deg);
}
.step-body {
  padding: 10px 16px 12px;
  background: rgba(0,0,0,0.2);
  border-left: 3px solid var(--step-border);
}
.step-body pre {
  margin: 0;
  font-size: 11px;
  font-family: 'SF Mono', Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-all;
  color: #a0aec0;
  line-height: 1.6;
}
.is-error .step-head {
  background: var(--error-bg);
}
</style>
