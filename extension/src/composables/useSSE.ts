import { ref } from 'vue'
import { useAnalysisStore } from '@/stores/analysis'
import { ensureOriginPermission } from '@/utils/permissions'
import type { AgentEvent } from '@/types/events'

export interface ParsedPlaneUrl {
  workspaceSlug: string
  issueIdentifier: string
}

/**
 * 通过服务端 /proxy-image 下载图片（使用 Playwright 自动化保持登录态）
 */
async function downloadImagesViaProxy(
  serverUrl: string,
  urls: string[]
): Promise<{ url: string; base64: string; mimeType: string }[]> {
  const results: { url: string; base64: string; mimeType: string }[] = []
  for (const imgUrl of urls) {
    try {
      const proxyUrl = `${serverUrl}/proxy-image?url=${encodeURIComponent(imgUrl)}`
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(30000) })
      if (!res.ok) {
        console.warn('[useSSE] proxy-image failed for', imgUrl, res.status)
        continue
      }
      const data = await res.json()
      if (data.ok && data.base64) {
        results.push({ url: imgUrl, base64: data.base64, mimeType: data.mimeType })
      }
    } catch (e) {
      console.error('[useSSE] proxy-image error for', imgUrl, e)
    }
  }
  return results
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

    // 远端后端：申请 host 权限（命中 manifest optional_host_permissions 时会有 Chrome 弹窗）
    const granted = await ensureOriginPermission(url)
    if (!granted) {
      analysisStore.setStatus('未授权访问该后端地址，请重试并在 Chrome 弹窗中允许')
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

      // Step 2: 通过服务端 /proxy-image 下载图片（使用 Playwright 自动化保持登录态）
      const images: { url: string; base64: string; mimeType: string }[] = []
      if (imageAssetUrls?.length) {
        analysisStore.setStatus(`下载图片中…（0/${imageAssetUrls.length}）`)
        const results = await downloadImagesViaProxy(url, imageAssetUrls)

        for (let i = 0; i < results.length; i++) {
          analysisStore.setStatus(`下载图片中…（${i + 1}/${imageAssetUrls.length}）`)
          images.push(results[i])
        }
        if (images.length === 0) {
          analysisStore.setStatus(`下载图片失败，跳过`)
        }
      }

      // Step 3: 发送分析请求（带上图片 base64 和角色）
      const res = await fetch(`${url}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed, images, role: analysisStore.role }),
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
