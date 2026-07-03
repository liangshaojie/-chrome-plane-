<script setup lang="ts">
import { computed } from 'vue'
import { useAnalysisStore } from '@/stores/analysis'
import { marked } from 'marked'
import { downloadAsFile, buildExportMarkdown, makeExportFilename } from '@/utils/export'

const analysisStore = useAnalysisStore()

const rendered = computed(() => {
  if (!analysisStore.outputText) return ''
  return marked.parse(analysisStore.outputText) as string
})

function exportMarkdown() {
  const issue = analysisStore.issue
  const content = buildExportMarkdown(issue, analysisStore.outputText)
  downloadAsFile(makeExportFilename(issue), content)
}
</script>

<template>
  <div class="output-pane">
    <div v-if="analysisStore.outputText" class="output-toolbar">
      <span class="toolbar-label">分析结果</span>
      <button
        class="btn-export"
        title="把当前分析结果导出为 Markdown 文件"
        @click="exportMarkdown"
      >
        <span class="icon">⬇</span>
        导出 Markdown
      </button>
    </div>
    <div
      v-if="analysisStore.outputText"
      class="markdown-body"
      v-html="rendered"
    />
    <div v-else class="empty">
      <span class="empty-icon">📋</span>
      <p>暂无分析结果</p>
    </div>
  </div>
</template>

<style scoped>
.output-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.output-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
  flex-shrink: 0;
}
.toolbar-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}
.btn-export {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-export:hover {
  background: var(--primary-bg, rgba(59, 130, 246, 0.12));
  color: var(--primary);
  border-color: rgba(59, 130, 246, 0.3);
}
.btn-export:active {
  transform: scale(0.97);
}
.btn-export .icon {
  font-size: 12px;
}
.markdown-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-muted);
}
.empty-icon {
  font-size: 28px;
  opacity: 0.4;
}
.empty p {
  font-size: 13px;
}
</style>
