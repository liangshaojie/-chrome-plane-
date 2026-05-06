<script setup lang="ts">
import { NTabs, NTab } from 'naive-ui'

defineProps<{ activeTab?: string }>()
const emit = defineEmits<{ (e: 'update:activeTab', v: string): void }>()
</script>

<template>
  <NTabs
    :value="activeTab"
    @update:value="emit('update:activeTab', $event)"
    type="line"
    size="small"
    class="tab-nav"
  >
    <NTab name="process">过程日志</NTab>
    <NTab name="result">分析结果</NTab>
  </NTabs>
</template>

<style scoped>
.tab-nav {
  padding: 0 16px;
}
</style>
