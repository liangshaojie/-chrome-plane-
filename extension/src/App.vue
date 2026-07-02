<script setup lang="ts">
import { ref, onMounted } from 'vue'
import TopBar from '@/components/TopBar.vue'
import Controls from '@/components/Controls.vue'
import IssueCard from '@/components/IssueCard.vue'
import StatusBar from '@/components/StatusBar.vue'
import TabNav from '@/components/TabNav.vue'
import ProcessLog from '@/components/ProcessLog.vue'
import OutputPane from '@/components/OutputPane.vue'
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()
const activeTab = ref('process')

onMounted(() => {
  settingsStore.loadFromStorage()
})
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
