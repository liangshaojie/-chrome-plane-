import { ref, onMounted, onUnmounted } from 'vue'

export function useChromeTabs() {
  const currentTabUrl = ref<string | null>(null)

  async function refreshActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    currentTabUrl.value = tab?.url ?? null
  }

  function onActivated(activeInfo: chrome.tabs.OnActivatedInfo) {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
      if (tab?.url) currentTabUrl.value = tab.url
    })
  }

  function onUpdated(tabId: number, info: { url?: string; status?: string }) {
    if (info.url || info.status === 'complete') {
      chrome.tabs.get(tabId, (tab) => {
        if (tab?.url) currentTabUrl.value = tab.url
      })
    }
  }

  onMounted(() => {
    refreshActiveTab()
    chrome.tabs.onActivated.addListener(onActivated)
    chrome.tabs.onUpdated.addListener(onUpdated)
  })

  onUnmounted(() => {
    chrome.tabs.onActivated.removeListener(onActivated)
    chrome.tabs.onUpdated.removeListener(onUpdated)
  })

  return { currentTabUrl }
}
