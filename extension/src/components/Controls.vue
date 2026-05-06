<script setup lang="ts">
import { NInput, NButton } from 'naive-ui'
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
    <NInput
      v-model:value="settingsStore.serverUrl"
      size="small"
      placeholder="http://127.0.0.1:8787"
      class="server-url"
    />
    <NButton
      type="primary"
      size="small"
      :disabled="!parsedUrl || isAnalyzing"
      @click="parsedUrl && startAnalysis(parsedUrl, settingsStore.serverUrl)"
    >
      开始分析
    </NButton>
    <NButton
      size="small"
      :disabled="!isAnalyzing"
      @click="stopAnalysis"
    >
      停止
    </NButton>
  </div>
</template>

<style scoped>
.controls {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  align-items: center;
}
.server-url {
  flex: 1;
}
</style>
