<script setup lang="ts">
import { NCard, NSpace, NTag, NText } from 'naive-ui'
import { useAnalysisStore } from '@/stores/analysis'

const analysisStore = useAnalysisStore()
</script>

<template>
  <NCard v-if="analysisStore.issue" size="small" class="issue-card" :bordered="false">
    <NSpace vertical :size="4">
      <NSpace align="center">
        <NTag size="tiny" type="info">{{ analysisStore.issue.identifier }}</NTag>
        <NText strong>{{ analysisStore.issue.title }}</NText>
      </NSpace>
      <NSpace :size="12">
        <NText v-if="analysisStore.issue.state" depth="3" style="font-size:12px">
          状态：{{ analysisStore.issue.state }}
        </NText>
        <NText v-if="analysisStore.issue.labels?.length" depth="3" style="font-size:12px">
          标签：{{ analysisStore.issue.labels.join(', ') }}
        </NText>
      </NSpace>
      <a :href="analysisStore.issue.url" target="_blank" class="issue-link">
        {{ analysisStore.issue.url }}
      </a>
    </NSpace>
  </NCard>
</template>

<style scoped>
.issue-card {
  margin: 0 16px 8px;
  background: #f8fafc;
}
.issue-link {
  font-size: 11px;
  color: #64748b;
  text-decoration: none;
}
.issue-link:hover {
  text-decoration: underline;
}
</style>
