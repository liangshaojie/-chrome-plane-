// Content Script: 在 Plane 页面运行，监听 sidepanel 消息
// 图片下载已迁移到服务端 Playwright 自动化

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'ping') {
    sendResponse({ type: 'pong' });
  }
  return true;
});
