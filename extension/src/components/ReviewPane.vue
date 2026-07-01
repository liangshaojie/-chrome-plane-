<script setup lang="ts">
import { useAnalysisStore } from '@/stores/analysis'

const analysisStore = useAnalysisStore()
</script>

<template>
  <div class="review-pane">
    <div v-if="analysisStore.reviewUrl" class="review-card">
      <div class="review-icon">✅</div>
      <div class="review-body">
        <div class="review-title">代码已提交到 Gerrit</div>
        <a
          class="review-link"
          :href="analysisStore.reviewUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ analysisStore.reviewUrl }}
        </a>
        <div class="review-hint">点击链接查看 / 评审本次改动</div>
      </div>
    </div>

    <div v-else class="empty">
      <span class="empty-icon">🔗</span>
      <p>暂无 Gerrit 提交链接</p>
      <p class="empty-sub">Agent 执行 <code>git push origin HEAD:refs/for/main</code> 后这里会展示</p>
    </div>
  </div>
</template>

<style scoped>
.review-pane {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.review-card {
  display: flex;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
}
.review-icon {
  font-size: 24px;
  line-height: 1.4;
}
.review-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.review-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.review-link {
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--primary);
  word-break: break-all;
  text-decoration: none;
}
.review-link:hover {
  text-decoration: underline;
}
.review-hint {
  font-size: 11px;
  color: var(--text-muted);
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 6px;
  color: var(--text-muted);
}
.empty-icon { font-size: 28px; opacity: 0.4; }
.empty p { font-size: 13px; }
.empty-sub { font-size: 11px !important; opacity: 0.7; text-align: center; }
.empty code {
  font-family: var(--font-mono, monospace);
  background: var(--bg-secondary);
  padding: 1px 4px;
  border-radius: 3px;
}
</style>
