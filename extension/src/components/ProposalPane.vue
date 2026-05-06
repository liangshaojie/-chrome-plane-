<script setup lang="ts">
import { computed } from 'vue'
import { useAnalysisStore } from '@/stores/analysis'

const analysisStore = useAnalysisStore()

interface Proposal {
  id: string
  title: string
  content: string
}

function extractProposals(markdown: string): Proposal[] {
  const proposals: Proposal[] = []
  const lines = markdown.split('\n')
  const proposalKeywords = ['修复方案', '技术方案', '子任务', '修改方案', '实施步骤', '推荐方案', '根因', '解决思路']

  let currentProposal: Proposal | null = null
  let contentLines: string[] = []

  for (const line of lines) {
    const h2 = line.match(/^## (.+)/)
    if (h2) {
      const title = h2[1].trim()
      const isProposal = proposalKeywords.some(k => title.includes(k))
      if (isProposal) {
        if (currentProposal) {
          currentProposal.content = contentLines.join('\n').trim()
          proposals.push(currentProposal)
        }
        currentProposal = { id: `p-${proposals.length}`, title, content: '' }
        contentLines = []
      } else if (currentProposal) {
        currentProposal.content = contentLines.join('\n').trim()
        proposals.push(currentProposal)
        currentProposal = null
        contentLines = []
      }
    } else if (currentProposal) {
      contentLines.push(line)
    }
  }

  if (currentProposal) {
    currentProposal.content = contentLines.join('\n').trim()
    proposals.push(currentProposal)
  }

  return proposals
}

const proposals = computed(() => extractProposals(analysisStore.outputText))
const emit = defineEmits<{ (e: 'adopt', proposal: Proposal): void }>()
</script>

<template>
  <div class="proposal-pane">
    <div v-if="!analysisStore.outputText" class="empty">
      <span class="empty-icon">💡</span>
      <p>分析完成后将自动提取修改方案</p>
    </div>
    <div v-else-if="proposals.length === 0" class="empty">
      <span class="empty-icon">📋</span>
      <p>未识别到明确的修改方案</p>
      <p class="empty-hint">请确保分析报告中包含「修复方案」「技术方案」等标题</p>
    </div>
    <div v-else class="proposal-list">
      <div v-for="p in proposals" :key="p.id" class="proposal-card">
        <div class="proposal-header">
          <span class="proposal-icon">💡</span>
          <span class="proposal-title">{{ p.title }}</span>
        </div>
        <pre v-if="p.content" class="proposal-content">{{ p.content }}</pre>
        <div class="proposal-actions">
          <button class="btn btn-primary btn-sm" @click="emit('adopt', p)">
            ✓ 采纳此方案
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.proposal-pane {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
  color: var(--text-muted);
  text-align: center;
}
.empty-icon {
  font-size: 28px;
  opacity: 0.4;
}
.empty p {
  font-size: 13px;
}
.empty-hint {
  font-size: 11px;
  opacity: 0.6;
}
.proposal-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.proposal-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.proposal-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(59, 130, 246, 0.08);
  border-bottom: 1px solid var(--border);
}
.proposal-icon {
  font-size: 14px;
}
.proposal-title {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
}
.proposal-content {
  margin: 0;
  padding: 10px 14px;
  font-size: 12px;
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-muted);
  line-height: 1.6;
  max-height: 200px;
  overflow-y: auto;
}
.proposal-actions {
  padding: 8px 14px;
  border-top: 1px solid var(--border);
}
</style>
