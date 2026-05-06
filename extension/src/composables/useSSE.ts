import { ref } from 'vue'
import { useAnalysisStore } from '@/stores/analysis'
import type { AgentEvent } from '@/types/events'

export function useSSE() {
  const isAnalyzing = ref(false)
  const abortCtrl = ref<AbortController | null>(null)
  const analysisStore = useAnalysisStore()

  async function startAnalysis(parsed: { workspaceSlug: string; issueIdentifier: string }, serverUrl: string) {
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
      const res = await fetch(`${url}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
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
