<script setup lang="ts">
import { usePlaneUrl } from '@/composables/usePlaneUrl'
import { useAnalysisStore } from '@/stores/analysis'

const { metaText } = usePlaneUrl()
const analysisStore = useAnalysisStore()
</script>

<template>
  <header class="topbar">
    <div class="topbar-left">
      <div class="logo">P</div>
      <div class="topbar-titles">
        <span class="title">Plane WorkItem Analyzer</span>
        <span class="meta">{{ analysisStore.issue ? `${analysisStore.issue.identifier} · ${analysisStore.issue.title}` : metaText }}</span>
      </div>
    </div>
    <div class="topbar-right">
      <div v-if="analysisStore.doneMeta" class="done-badge">
        <span class="done-check">✓</span>
        <span v-if="analysisStore.doneMeta.durationMs" class="done-info">
          {{ (analysisStore.doneMeta.durationMs / 1000).toFixed(1) }}s
        </span>
        <span v-if="analysisStore.doneMeta.costUsd" class="done-info">
          ${{ analysisStore.doneMeta.costUsd.toFixed(4) }}
        </span>
      </div>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  flex-shrink: 0;
  gap: 12px;
}
.topbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.logo {
  width: 28px;
  height: 28px;
  background: var(--primary);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 14px;
  color: #fff;
  flex-shrink: 0;
}
.topbar-titles {
  min-width: 0;
}
.title {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}
.topbar-right {
  flex-shrink: 0;
}
.done-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--success-bg);
  border: 1px solid rgba(104, 211, 145, 0.3);
  border-radius: 20px;
}
.done-check {
  color: var(--success);
  font-size: 11px;
}
.done-info {
  font-size: 11px;
  color: var(--success);
  font-weight: 500;
}
</style>
