<script setup lang="ts">
const activeTab = defineModel<string>({ default: 'process' })
</script>

<template>
  <nav class="tab-nav">
    <button
      :class="['tab', activeTab === 'process' && 'active']"
      @click="activeTab = 'process'"
    >过程日志</button>
    <button
      :class="['tab', activeTab === 'result' && 'active']"
      @click="activeTab = 'result'"
    >分析结果</button>
  </nav>
</template>

<style scoped>
.tab-nav {
  display: flex;
  gap: 0;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.tab {
  padding: 6px 12px;
  border: none;
  background: none;
  font-size: 13px;
  color: var(--text-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}
.tab:hover {
  color: var(--text);
}
.tab.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
  font-weight: 500;
}
</style>
