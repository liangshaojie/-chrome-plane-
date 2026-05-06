<script setup lang="ts">
import { useAnalysisStore } from '@/stores/analysis'

const analysisStore = useAnalysisStore()
</script>

<template>
  <div v-if="analysisStore.issue" class="issue-card">
    <div class="issue-header">
      <span class="tag tag-info">{{ analysisStore.issue.identifier }}</span>
      <span class="issue-title">{{ analysisStore.issue.title }}</span>
    </div>
    <div class="issue-meta">
      <span v-if="analysisStore.issue.state">状态：{{ analysisStore.issue.state }}</span>
      <span v-if="analysisStore.issue.labels?.length">标签：{{ analysisStore.issue.labels.join(', ') }}</span>
    </div>
    <a :href="analysisStore.issue.url" target="_blank" class="issue-link">
      {{ analysisStore.issue.url }}
    </a>
  </div>
</template>

<style scoped>
.issue-card {
  margin: 0 16px 8px;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  flex-shrink: 0;
}
.issue-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.issue-title {
  font-weight: 500;
  font-size: 13px;
}
.issue-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.issue-link {
  font-size: 11px;
  color: var(--text-muted);
  text-decoration: none;
}
.issue-link:hover {
  text-decoration: underline;
}
</style>
