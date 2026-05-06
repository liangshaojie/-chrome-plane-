// Content Script: 在 Plane 页面运行，从 DOM 提取图片 URL 并下载为 base64
// 与 sidepanel 通过 chrome.runtime.sendMessage 通信

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'downloadImages') return;

  (async () => {
    const results = [];
    for (const url of msg.urls) {
      try {
        const res = await fetch(url, { redirect: 'follow', credentials: 'include' });
        if (!res.ok) {
          console.warn('[content] fetch failed for', url, res.status);
          continue;
        }
        const buf = await res.arrayBuffer();
        const mimeType = res.headers.get('content-type') ?? 'image/png';
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        results.push({ url, base64, mimeType });
      } catch (e) {
        console.error('[content] error fetching', url, e);
      }
    }
    sendResponse({ type: 'downloadImagesResult', results });
  })();

  return true;
});
