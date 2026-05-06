import { ref } from 'vue'
import { useAnalysisStore } from '@/stores/analysis'
import type { AgentEvent } from '@/types/events'

export interface ParsedPlaneUrl {
  workspaceSlug: string
  issueIdentifier: string
}

/**
 * 通过 content script 下载图片
 * 用户使用的是官方 Plane（app.plane.so），asset URL 鉴权依赖 plane.so 页面的 session cookie，
 * 所以必须从 content script 里发起 fetch（带 credentials:'include'）。
 */
async function downloadImagesViaContentScript(
  urls: string[]
): Promise<{ url: string; base64: string; mimeType: string }[]> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id
      if (!tabId) {
        console.warn('[useSSE] 未找到当前 tab')
        resolve([])
        return
      }
      const timeout = setTimeout(() => {
        console.warn('[useSSE] content script 下载超时（30s）')
        resolve([])
      }, 30000)
      try {
        chrome.tabs.sendMessage(tabId, { type: 'downloadImages', urls }, (resp) => {
          clearTimeout(timeout)
          const lastErr = chrome.runtime.lastError
          if (lastErr) {
            console.warn('[useSSE] sendMessage 失败：', lastErr.message, '——请刷新一下 plane.so 页面让 content script 重新注入')
            resolve([])
            return
          }
          console.log('[useSSE] content script 响应：', {
            requested: urls.length,
            received: resp?.results?.length ?? 0,
          })
          resolve(resp?.results ?? [])
        })
      } catch (e) {
        clearTimeout(timeout)
        console.error('[useSSE] sendMessage 异常：', e)
        resolve([])
      }
    })
  })
}

export function useSSE() {
  const isAnalyzing = ref(false)
  const abortCtrl = ref<AbortController | null>(null)
  const analysisStore = useAnalysisStore()

  async function startAnalysis(parsed: ParsedPlaneUrl, serverUrl: string) {
    if (isAnalyzing.value) return
    const url = serverUrl.replace(/\/$/, '')
    if (!url) {
      analysisStore.setStatus('请填写后端地址')
      return
    }

    analysisStore.resetAnalysis()
    analysisStore.setStatus('连接后端…')
    isAnalyzing.value = true
    analysisStore.phase = 'analyzing'

    abortCtrl.value = new AbortController()

    try {
      // Step 1: 获取 description_html 和图片 asset URL 列表
      const detailRes = await fetch(`${url}/issue-detail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
        signal: abortCtrl.value.signal,
      })
      if (!detailRes.ok) throw new Error(`issue-detail 失败 ${detailRes.status}`)
      const { imageAssetUrls } = await detailRes.json().catch(() => ({ imageAssetUrls: [] as string[] }))

      // Step 2: 通过 content script 下载图片（它运行在 plane.so 页面，有页面 session cookie）
      const images: { url: string; base64: string; mimeType: string }[] = []
      if (imageAssetUrls?.length) {
        analysisStore.setStatus(`下载图片中…（0/${imageAssetUrls.length}）`)
        const results = await downloadImagesViaContentScript(imageAssetUrls)
        for (let i = 0; i < results.length; i++) {
          analysisStore.setStatus(`下载图片中…（${i + 1}/${imageAssetUrls.length}）`)
          images.push(results[i])
        }
        if (images.length === 0) {
          analysisStore.setStatus(`下载图片失败，跳过`)
        }
      }

      // Step 3: 发送分析请求（带上图片 base64）
      const res = await fetch(`${url}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed, images }),
        signal: abortCtrl.value.signal,
      })

      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => '')
        throw new Error(`后端响应错误 ${res.status}: ${txt}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buf = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let idx
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const raw = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          const line = raw.split('\n').find((l) => l.startsWith('data:'))
          if (!line) continue
          const json = line.slice(5).trim()
          if (!json) continue
          try {
            const ev: AgentEvent = JSON.parse(json)
            analysisStore.handleEvent(ev)
          } catch (e) {
            console.error('parse SSE failed', e, json)
          }
        }
      }

      analysisStore.setStatus('完成')
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        analysisStore.setStatus('已停止')
      } else {
        const msg = err instanceof Error ? err.message : String(err)
        analysisStore.setStatus(msg)
        analysisStore.phase = 'error'
      }
    } finally {
      isAnalyzing.value = false
      abortCtrl.value = null
    }
  }

  function stopAnalysis() {
    abortCtrl.value?.abort()
  }

  return { isAnalyzing, startAnalysis, stopAnalysis }
}
