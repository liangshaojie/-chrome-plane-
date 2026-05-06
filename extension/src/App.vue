<script setup lang="ts">
import { NConfigProvider, NMessageProvider, NScrollbar } from 'naive-ui'
import { ref, onMounted } from 'vue'
import TopBar from '@/components/TopBar.vue'
import Controls from '@/components/Controls.vue'
import IssueCard from '@/components/IssueCard.vue'
import StatusBar from '@/components/StatusBar.vue'
import TabNav from '@/components/TabNav.vue'
import ProcessLog from '@/components/ProcessLog.vue'
import OutputPane from '@/components/OutputPane.vue'
import Writeback from '@/components/Writeback.vue'
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()
const activeTab = ref('process')

onMounted(() => {
  settingsStore.loadFromStorage()
})

const themeOverrides = {
  common: {
    borderRadius: '6px',
    fontSize: '13px',
    primaryColor: '#2563eb',
  },
}
</script>

<template>
  <NConfigProvider :theme-overrides="themeOverrides">
    <NMessageProvider>
      <div class="app">
        <TopBar />
        <Controls />
        <IssueCard />
        <StatusBar />
        <TabNav v-model:active-tab="activeTab" />
        <div class="pane-container">
          <NScrollbar v-show="activeTab === 'process'" style="height: 100%">
            <ProcessLog />
          </NScrollbar>
          <NScrollbar v-show="activeTab === 'result'" style="height: 100%">
            <OutputPane />
          </NScrollbar>
        </div>
        <Writeback />
      </div>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
html, body {
  height: 100%;
  overflow: hidden;
}
#app {
  height: 100%;
}
</style>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
.pane-container {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}
</style>
