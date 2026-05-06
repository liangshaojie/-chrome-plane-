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
      <span v-if="analysisStore.issue.state" class="meta-item">
        <span class="meta-dot state-dot" />
        {{ analysisStore.issue.state }}
      </span>
      <span v-if="analysisStore.issue.labels?.length" class="meta-item">
        <span class="meta-dot" />
        {{ analysisStore.issue.labels.join(', ') }}
      </span>
    </div>
    <a :href="analysisStore.issue.url" target="_blank" class="issue-link">
      <span class="link-icon">↗</span>
      {{ analysisStore.issue.url }}
    </a>
  </div>
</template>

<style scoped>
.issue-card {
  margin: 8px 16px;
  padding: 12px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  flex-shrink: 0;
}
.issue-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.issue-title {
  font-weight: 500;
  font-size: 13px;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag-info {
  background: var(--primary-bg);
  color: var(--primary);
  border: 1px solid rgba(59,130,246,0.3);
  flex-shrink: 0;
}
.issue-meta {
  display: flex;
  gap: 16px;
  margin-bottom: 8px;
}
.meta-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-muted);
}
.meta-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--text-muted);
}
.state-dot {
  background: var(--success);
}
.issue-link {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.issue-link:hover {
  color: var(--primary);
  text-decoration: underline;
}
.link-icon {
  font-size: 10px;
  flex-shrink: 0;
}
</style>
