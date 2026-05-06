<script setup lang="ts">
const activeTab = defineModel<string>({ default: 'process' })
</script>

<template>
  <nav class="tab-nav">
    <button
      :class="['tab', activeTab === 'process' && 'active']"
      @click="activeTab = 'process'"
    >
      过程日志
    </button>
    <button
      :class="['tab', activeTab === 'result' && 'active']"
      @click="activeTab = 'result'"
    >
      分析结果
    </button>
  </nav>
</template>

<style scoped>
.tab-nav {
  display: flex;
  padding: 0 16px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.tab {
  padding: 8px 14px;
  border: none;
  background: none;
  font-size: 13px;
  color: var(--text-muted);
  cursor: pointer;
  position: relative;
  transition: color 0.15s;
  font-weight: 500;
}
.tab:hover {
  color: var(--text);
}
.tab.active {
  color: #fff;
}
.tab.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--primary);
  border-radius: 2px 2px 0 0;
}
</style>
