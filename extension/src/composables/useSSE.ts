import { ref } from 'vue'
import { useAnalysisStore } from '@/stores/analysis'
import type { AgentEvent } from '@/types/events'

export interface ParsedPlaneUrl {
  workspaceSlug: string
  issueIdentifier: string
}

async function fetchImageAsBase64(url: string, serverUrl: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const proxyUrl = `${serverUrl.replace(/\/$/, '')}/proxy-image?url=${encodeURIComponent(url)}`
    const res = await fetch(proxyUrl)
    if (!res.ok) return null
    const data = await res.json() as { ok: boolean; base64?: string; mimeType?: string; error?: string }
    if (!data.ok || !data.base64) return null
    return { base64: data.base64, mimeType: data.mimeType ?? 'image/png' }
  } catch {
    return null
  }
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

      // Step 2: 前端下载图片（带 Cookie）- 转换 asset URL 为 base64
      const images: { url: string; base64: string; mimeType: string }[] = []
      if (imageAssetUrls?.length) {
        analysisStore.setStatus(`下载图片中…（0/${imageAssetUrls.length}）`)
        for (let i = 0; i < imageAssetUrls.length; i++) {
          analysisStore.setStatus(`下载图片中…（${i + 1}/${imageAssetUrls.length}）`)
          const result = await fetchImageAsBase64(imageAssetUrls[i], url)
          if (result) {
            images.push({ url: imageAssetUrls[i], ...result })
          }
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
