<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import TopBar from '@/components/TopBar.vue'
import Controls from '@/components/Controls.vue'
import IssueCard from '@/components/IssueCard.vue'
import StatusBar from '@/components/StatusBar.vue'
import TabNav from '@/components/TabNav.vue'
import ProcessLog from '@/components/ProcessLog.vue'
import OutputPane from '@/components/OutputPane.vue'
import ReviewPane from '@/components/ReviewPane.vue'
import { useSettingsStore } from '@/stores/settings'
import { useAnalysisStore } from '@/stores/analysis'

const settingsStore = useSettingsStore()
const analysisStore = useAnalysisStore()
const activeTab = ref('process')

onMounted(() => {
  settingsStore.loadFromStorage()
})

// 收到 Gerrit 提交链接后，自动切到“Gerrit 提交”tab，方便直接查看
watch(
  () => analysisStore.reviewUrl,
  (url) => {
    if (url) activeTab.value = 'review'
  }
)
</script>

<template>
  <div class="app">
    <TopBar />
    <Controls />
    <IssueCard />
    <StatusBar />
    <TabNav v-model="activeTab" />
    <div class="pane-container">
      <ProcessLog v-show="activeTab === 'process'" />
      <OutputPane v-show="activeTab === 'result'" />
      <ReviewPane v-show="activeTab === 'review'" />
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
}
.pane-container {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
