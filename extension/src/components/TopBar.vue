<script setup lang="ts">
import { usePlaneUrl } from '@/composables/usePlaneUrl'
import { useAnalysisStore } from '@/stores/analysis'

const { metaText } = usePlaneUrl()
const analysisStore = useAnalysisStore()
</script>

<template>
  <header class="topbar">
    <span class="title">Plane WorkItem Analyzer</span>
    <span class="meta">
      {{ analysisStore.issue ? `${analysisStore.issue.identifier} · ${analysisStore.issue.title}` : metaText }}
    </span>
  </header>
</template>

<style scoped>
.topbar {
  padding: 12px 16px 8px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.title {
  display: block;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}
.meta {
  font-size: 12px;
  color: var(--text-muted);
}
</style>
