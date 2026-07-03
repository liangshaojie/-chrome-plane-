import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  const serverUrl = ref('http://10.10.10.67:8787')

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
