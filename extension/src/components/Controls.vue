<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'
import { usePlaneUrl } from '@/composables/usePlaneUrl'
import { useSSE } from '@/composables/useSSE'
import { watch } from 'vue'

const settingsStore = useSettingsStore()
const { parsedUrl } = usePlaneUrl()
const { isAnalyzing, startAnalysis, stopAnalysis } = useSSE()

watch(() => settingsStore.serverUrl, () => {
  settingsStore.saveToStorage()
})
</script>

<template>
  <div class="controls">
    <input
      v-model="settingsStore.serverUrl"
      class="input server-url"
      placeholder="http://127.0.0.1:8787"
    />
    <button
      class="btn btn-primary"
      :disabled="!parsedUrl || isAnalyzing"
      @click="parsedUrl && startAnalysis(parsedUrl, settingsStore.serverUrl)"
    >
      开始分析
    </button>
    <button
      class="btn btn-secondary"
      :disabled="!isAnalyzing"
      @click="stopAnalysis"
    >
      停止
    </button>
  </div>
</template>

<style scoped>
.controls {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  align-items: center;
  flex-shrink: 0;
}
.server-url {
  flex: 1;
}
</style>
