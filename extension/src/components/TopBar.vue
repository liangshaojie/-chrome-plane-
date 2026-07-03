<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { usePlaneUrl } from '@/composables/usePlaneUrl'
import { useAnalysisStore } from '@/stores/analysis'
import { APP_VERSION, CHANGELOG } from '@/changelog'

const { metaText } = usePlaneUrl()
const analysisStore = useAnalysisStore()

const showChangelog = ref(false)

function openChangelog() {
  showChangelog.value = true
}
function closeChangelog() {
  showChangelog.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && showChangelog.value) closeChangelog()
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
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
      <button
        class="version-btn"
        :title="`查看更新日志（v${APP_VERSION}）`"
        @click="openChangelog"
      >
        <span class="version-tag">v{{ APP_VERSION }}</span>
        <span class="version-action">更新日志</span>
      </button>
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

  <!-- 更新日志弹框 -->
  <div v-if="showChangelog" class="changelog-backdrop" @click.self="closeChangelog">
    <div class="changelog-dialog" role="dialog" aria-modal="true" aria-labelledby="changelog-title">
      <div class="changelog-header">
        <h2 id="changelog-title">更新日志</h2>
        <button class="close-btn" aria-label="关闭" @click="closeChangelog">×</button>
      </div>
      <div class="changelog-body">
        <section
          v-for="entry in CHANGELOG"
          :key="entry.version"
          :class="['changelog-entry', entry.version === APP_VERSION && 'is-current']"
        >
          <header class="entry-header">
            <span class="entry-version">v{{ entry.version }}</span>
            <span class="entry-date">{{ entry.date }}</span>
            <span v-if="entry.version === APP_VERSION" class="entry-current">当前版本</span>
          </header>
          <ul class="entry-items">
            <li v-for="(item, i) in entry.items" :key="i">{{ item }}</li>
          </ul>
        </section>
      </div>
      <div class="changelog-footer">
        <button class="btn-primary" @click="closeChangelog">明白了</button>
      </div>
    </div>
  </div>
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
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.version-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.version-btn:hover {
  background: var(--primary-bg, rgba(59, 130, 246, 0.12));
  color: var(--primary);
  border-color: rgba(59, 130, 246, 0.3);
}
.version-tag {
  font-family: var(--font-mono, monospace);
  letter-spacing: 0.2px;
  font-weight: 600;
}
.version-action {
  color: var(--text-muted);
}
.version-btn:hover .version-action {
  color: var(--primary);
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

/* ---- 更新日志弹框 ---- */
.changelog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
}
.changelog-dialog {
  width: 100%;
  max-width: 560px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-card, #1f2937);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  animation: dialog-in 0.18s ease-out;
}
@keyframes dialog-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.changelog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.changelog-header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
}
.close-btn {
  border: none;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0 4px;
}
.close-btn:hover {
  color: #fff;
}
.changelog-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 18px 4px;
}
.changelog-entry {
  border-left: 2px solid var(--border);
  padding: 4px 0 10px 14px;
  margin-bottom: 6px;
}
.changelog-entry.is-current {
  border-left-color: var(--primary);
}
.entry-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.entry-version {
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  font-weight: 700;
  color: var(--primary);
}
.entry-date {
  font-size: 11px;
  color: var(--text-muted);
}
.entry-current {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 8px;
  background: var(--primary-bg, rgba(59, 130, 246, 0.15));
  color: var(--primary);
  font-weight: 500;
}
.entry-items {
  margin: 0;
  padding-left: 18px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text);
}
.entry-items li {
  margin-bottom: 2px;
}
.changelog-footer {
  display: flex;
  justify-content: flex-end;
  padding: 10px 18px 14px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
.btn-primary {
  padding: 6px 18px;
  border-radius: 6px;
  border: 1px solid var(--primary);
  background: var(--primary);
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: filter 0.15s;
}
.btn-primary:hover {
  filter: brightness(1.08);
}
</style>
