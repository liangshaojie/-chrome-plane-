import { defineStore } from 'pinia'
import { ref } from 'vue'

// 构建时由 Vite 按 mode 注入：
//   npm run dev   → .env.development 的 VITE_DEFAULT_SERVER_URL
//   npm run build → .env.production  的 VITE_DEFAULT_SERVER_URL
// 作为首次默认值；用户在 UI 改过之后以 chrome.storage 里的值为准。
const DEFAULT_SERVER_URL = import.meta.env.VITE_DEFAULT_SERVER_URL ?? ''

export const useSettingsStore = defineStore('settings', () => {
  const serverUrl = ref(DEFAULT_SERVER_URL)

  async function loadFromStorage() {
    if (!chrome?.storage?.local) return
    const s = await chrome.storage.local.get(['serverUrl'])
    // 用户曾经手填过就用用户的值；否则保留环境变量烘焙的默认值
    if (s?.serverUrl && typeof s.serverUrl === 'string') serverUrl.value = s.serverUrl
  }

  async function saveToStorage() {
    if (!chrome?.storage?.local) return
    await chrome.storage.local.set({ serverUrl: serverUrl.value })
  }

  return { serverUrl, loadFromStorage, saveToStorage }
})
