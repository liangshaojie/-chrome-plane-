<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useAnalysisStore, USER_ROLES } from '@/stores/analysis'
import { usePlaneUrl } from '@/composables/usePlaneUrl'
import { useSSE } from '@/composables/useSSE'
import { watch } from 'vue'

const settingsStore = useSettingsStore()
const analysisStore = useAnalysisStore()
const { parsedUrl } = usePlaneUrl()
const { isAnalyzing, startAnalysis, stopAnalysis } = useSSE()

// 隐藏『开发者』角色，仅对外提供测试人员/业务人员两档
const visibleRoles = computed(() => USER_ROLES.filter((r) => r.value !== 'developer'))

watch(() => settingsStore.serverUrl, () => {
  settingsStore.saveToStorage()
})
</script>

<template>
  <div class="controls">
    <div class="role-selector" role="radiogroup" aria-label="选择角色">
      <button
        v-for="r in visibleRoles"
        :key="r.value"
        class="role-btn"
        :class="{ active: analysisStore.role === r.value }"
        :disabled="isAnalyzing"
        :title="r.label"
        @click="analysisStore.setRole(r.value)"
      >
        <span class="role-icon">{{ r.icon }}</span>
        <span class="role-label">{{ r.label }}</span>
      </button>
    </div>

    <input
      v-model="settingsStore.serverUrl"
      class="input server-url"
      placeholder="http://<server-ip>:8787"
    />
    <button
      class="btn btn-primary"
      :disabled="!parsedUrl || isAnalyzing"
      @click="parsedUrl && startAnalysis(parsedUrl, settingsStore.serverUrl)"
    >
      <span class="btn-icon">▶</span>
      开始分析
    </button>
    <button
      class="btn btn-secondary"
      :disabled="!isAnalyzing"
      @click="stopAnalysis"
    >
      ■ 停止
    </button>
  </div>
</template>

<style scoped>
.controls {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  align-items: center;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.role-selector {
  display: flex;
  gap: 4px;
  padding: 2px;
  background: var(--bg-soft, rgba(0, 0, 0, 0.04));
  border-radius: 8px;
}
.role-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-soft, #6b7280);
  transition: all 0.15s;
}
.role-btn:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text, #111827);
}
.role-btn.active {
  background: var(--primary, #2563eb);
  color: #fff;
  border-color: var(--primary, #2563eb);
}
.role-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.role-icon {
  font-size: 14px;
}
.role-label {
  font-weight: 500;
}
.server-url {
  flex: 1;
  min-width: 180px;
  max-width: 280px;
}
.btn-icon {
  font-size: 10px;
}
</style>