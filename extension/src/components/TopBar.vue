<script setup lang="ts">
import { NText } from 'naive-ui'
import { usePlaneUrl } from '@/composables/usePlaneUrl'
import { useAnalysisStore } from '@/stores/analysis'

const { metaText } = usePlaneUrl()
const analysisStore = useAnalysisStore()
</script>

<template>
  <div class="topbar">
    <NText strong depth="1" class="title">Plane WorkItem Analyzer</NText>
    <NText depth="3" class="meta">{{ analysisStore.issue ? `${analysisStore.issue.identifier} · ${analysisStore.issue.title}` : metaText }}</NText>
  </div>
</template>

<style scoped>
.topbar {
  padding: 12px 16px 8px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}
.title {
  display: block;
  font-size: 14px;
  margin-bottom: 4px;
}
.meta {
  font-size: 12px;
}
</style>
