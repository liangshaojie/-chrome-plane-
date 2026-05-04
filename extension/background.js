// Service Worker：点击图标时打开 Side Panel
chrome.runtime.onInstalled.addListener(() => {
  // 允许通过点击 action 图标打开侧边栏
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error("setPanelBehavior failed", err));
});
