// 多轮「接着追问」对话的 store
// 状态：messages（按时间顺序，role=user|assistant）、phase、streamingText（agent 流式回包）
// 调 /chat SSE 接口，把流式事件累积到 messages 里。
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  role: ChatRole
  content: string
  /** 这一条消息的流式状态（仅 assistant 在 streaming 时有值） */
  streaming?: boolean
  /** 流式状态中累积的临时文本，用于打字机效果 */
  streamingContent?: string
}

export interface ChatContext {
  analysisId: number | null
  workspaceSlug: string
  issueIdentifier: string
}

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const phase = ref<'idle' | 'sending' | 'streaming' | 'error'>('idle')
  const error = ref('')
  const sessionId = ref<number | null>(null)
  const abortCtrl = ref<AbortController | null>(null)

  function reset() {
    messages.value = []
    phase.value = 'idle'
    error.value = ''
    sessionId.value = null
    abortCtrl.value?.abort()
    abortCtrl.value = null
  }

  function loadHistory(msgs: ChatMessage[], sid: number | null) {
    messages.value = msgs.map((m) => ({ role: m.role, content: m.content }))
    sessionId.value = sid
    phase.value = 'idle'
    error.value = ''
  }

  /**
   * 发一条消息给后端 /chat，监听 SSE 流式回包。
   * 调用前：用户输入的文本已经 addUserMessage 加到 messages 里。
   */
  async function send(ctx: ChatContext, serverUrl: string) {
    if (phase.value === 'sending' || phase.value === 'streaming') return
    const url = serverUrl.replace(/\/$/, '')
    if (!url) {
      error.value = '请填写后端地址'
      phase.value = 'error'
      return
    }
    phase.value = 'sending'
    error.value = ''

    // 取最近一条 user 消息作为本轮问题
    const lastUser = [...messages.value].reverse().find((m) => m.role === 'user')
    if (!lastUser) {
      phase.value = 'idle'
      return
    }

    abortCtrl.value?.abort()
    abortCtrl.value = new AbortController()

    // 准备一个 streaming assistant 占位
    const placeholder: ChatMessage = { role: 'assistant', content: '', streaming: true, streamingContent: '' }
    messages.value.push(placeholder)
    const placeholderIdx = messages.value.length - 1

    try {
      const res = await fetch(`${url}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisId: ctx.analysisId,
          workspaceSlug: ctx.workspaceSlug,
          issueIdentifier: ctx.issueIdentifier,
          message: lastUser.content,
        }),
        signal: abortCtrl.value.signal,
      })
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => '')
        throw new Error(`后端响应错误 ${res.status}: ${txt}`)
      }
      phase.value = 'streaming'

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
          let ev: any
          try {
            ev = JSON.parse(json)
          } catch {
            continue
          }
          handleChatEvent(ev, placeholderIdx)
        }
      }
      // 流结束：把 placeholder 的 streamingContent 合到 content
      finalizePlaceholder(placeholderIdx)
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        error.value = '已停止'
      } else {
        error.value = err instanceof Error ? err.message : String(err)
      }
      // 失败的占位要么保留作为错误展示，要么移除
      const ph = messages.value[placeholderIdx]
      if (ph && ph.role === 'assistant' && !ph.content && !ph.streamingContent) {
        messages.value.splice(placeholderIdx, 1)
      } else {
        finalizePlaceholder(placeholderIdx)
      }
      phase.value = 'error'
    } finally {
      abortCtrl.value = null
    }
  }

  function handleChatEvent(ev: any, placeholderIdx: number) {
    const ph = messages.value[placeholderIdx]
    if (!ph) return
    switch (ev.type) {
      case 'status':
        // 不入正文，状态条单独显示
        break
      case 'text':
        ph.streamingContent = (ph.streamingContent ?? '') + String(ev.text ?? '')
        break
      case 'thinking':
        // 思考过程不入正文（占位以后可加折叠区显示）
        break
      case 'tool_use':
        // 在正文里加一行工具调用指示
        ph.streamingContent = (ph.streamingContent ?? '') + `\n\n🔧 ${ev.name}\n`
        break
      case 'tool_result':
        // 结果预览省略，避免内容过长；只在流式 chunk 中追加标识
        ph.streamingContent = (ph.streamingContent ?? '') + '_(工具结果已返回)_\n'
        break
      case 'done':
        // done 时累计成本/耗时，挂到 message 上供 UI 展示
        if (ev.durationMs != null || ev.costUsd != null) {
          ;(ph as any).doneMeta = {
            durationMs: ev.durationMs,
            costUsd: ev.costUsd,
            numTurns: ev.numTurns,
          }
        }
        break
      case 'error':
        error.value = ev.message
        ph.streamingContent = (ph.streamingContent ?? '') + `\n\n⚠️ ${ev.message}\n`
        break
      case 'saved':
        // 后端落库 sessionId（如有）
        if (typeof ev.sessionId === 'number') sessionId.value = ev.sessionId
        break
      case 'end':
        // 流结束
        break
    }
  }

  function finalizePlaceholder(idx: number) {
    const ph = messages.value[idx]
    if (!ph) return
    if (ph.streamingContent != null) {
      ph.content = ph.streamingContent
      ph.streamingContent = ''
    }
    ph.streaming = false
  }

  function stop() {
    abortCtrl.value?.abort()
    abortCtrl.value = null
  }

  function addUserMessage(text: string) {
    messages.value.push({ role: 'user', content: text })
  }

  return {
    messages,
    phase,
    error,
    sessionId,
    addUserMessage,
    send,
    stop,
    reset,
    loadHistory,
  }
})