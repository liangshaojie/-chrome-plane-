import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  // 默认不写死任何 IP，由 Controls.vue 的 placeholder 提示用户填入 http://<server-ip>:8787
  const serverUrl = ref('')

  async function loadFromStorage() {
    if (!chrome?.storage?.local) return
    const s = await chrome.storage.local.get(['serverUrl'])
    if (s?.serverUrl && typeof s.serverUrl === 'string') serverUrl.value = s.serverUrl
  }

  async function saveToStorage() {
    if (!chrome?.storage?.local) return
    await chrome.storage.local.set({ serverUrl: serverUrl.value })
  }

  return { serverUrl, loadFromStorage, saveToStorage }
})
