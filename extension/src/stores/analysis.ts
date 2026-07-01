import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AgentEvent, IssueInfo, Step, EventKind, ChangedFile } from '@/types/events'

function truncate(str: string | null | undefined, n = 120): string {
  if (!str) return ''
  const one = String(str).replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n) + '…' : one
}

let stepIdCounter = 0

export const useAnalysisStore = defineStore('analysis', () => {
  const phase = ref<'idle' | 'analyzing' | 'done' | 'error'>('idle')
  const statusMessage = ref('')
  const issue = ref<IssueInfo | null>(null)
  const steps = ref<Step[]>([])
  const outputText = ref('')
  const reviewUrl = ref('')
  const changedFiles = ref<ChangedFile[]>([])
  // changeAction: '' 待确认 | 'committing' 提交中 | 'reverting' 恢复中 | 'committed' 已提交 | 'reverted' 已恢复 | 'error'
  const changeAction = ref<'' | 'committing' | 'reverting' | 'committed' | 'reverted' | 'error'>('')
  const changeMessage = ref('')
  const doneMeta = ref<{ subtype?: string; durationMs?: number; costUsd?: number; numTurns?: number } | null>(null)

  const stepByToolId = new Map<string, number>()

  function resetAnalysis() {
    phase.value = 'idle'
    statusMessage.value = ''
    issue.value = null
    steps.value = []
    outputText.value = ''
    reviewUrl.value = ''
    changedFiles.value = []
    changeAction.value = ''
    changeMessage.value = ''
    doneMeta.value = null
    stepByToolId.clear()
  }

  function addStep(kind: EventKind, badge: string, title: string, body = '', toolUseId?: string, isError = false): number {
    const id = `step-${++stepIdCounter}`
    const step: Step = { id, kind, badge, title, body, isOpen: false, toolUseId, isError }
    const idx = steps.value.length
    steps.value.push(step)
    if (toolUseId) stepByToolId.set(toolUseId, idx)
    return idx
  }

  function setStatus(msg: string) {
    statusMessage.value = msg
  }

  function handleEvent(ev: AgentEvent) {
    switch (ev.type) {
      case 'status':
        setStatus(ev.message)
        addStep('sys', '状态', ev.message)
        break

      case 'issue':
        issue.value = ev.issue
        addStep('sys', 'Plane', `已拉取 ${ev.issue.identifier} · ${ev.issue.title}`, JSON.stringify(ev.issue, null, 2))
        break

      case 'system': {
        const body = `session: ${ev.sessionId || '-'}\ncwd: ${ev.cwd || '-'}\ntools: ${(ev.tools || []).join(', ') || '-'}`
        addStep('sys', 'SDK', `初始化 ${ev.model || ''}${ev.subtype ? ' · ' + ev.subtype : ''}`, body)
        break
      }

      case 'thinking':
        addStep('think', '思考', truncate(ev.text), ev.text)
        break

      case 'text':
        outputText.value += ev.text
        addStep('text', '回答', truncate(ev.text, 80), ev.text)
        break

      case 'tool_use': {
        const inputStr = typeof ev.input === 'string' ? ev.input : JSON.stringify(ev.input, null, 2)
        const summary = truncate(typeof ev.input === 'string' ? ev.input : JSON.stringify(ev.input), 80)
        addStep('tool', `🔧 ${ev.name}`, summary || '(无参数)', inputStr, ev.id)
        break
      }

      case 'tool_result': {
        const idx = stepByToolId.get(ev.toolUseId)
        const preview = truncate(ev.content, 80)
        if (idx !== undefined) {
          const step = steps.value[idx]
          if (step) {
            step.isError = !!ev.isError
            step.body += `\n\n← 结果${ev.isError ? '（错误）' : ''}:\n${ev.content}`
            step.title = `${step.title} → ${preview}`
          }
        } else {
          addStep('result', ev.isError ? '工具错误' : '工具结果', preview, ev.content, undefined, !!ev.isError)
        }
        break
      }

      case 'error':
        setStatus(ev.message)
        addStep('err', '错误', ev.message, ev.message)
        break

      case 'changes':
        changedFiles.value = ev.files
        addStep('done', '代码改动', `共 ${ev.files.length} 个文件被修改，等待确认`)
        break

      case 'done': {
        const parts: string[] = [`subtype=${ev.subtype}`]
        if (ev.numTurns != null) parts.push(`turns=${ev.numTurns}`)
        if (ev.durationMs != null) parts.push(`${(ev.durationMs / 1000).toFixed(1)}s`)
        if (ev.costUsd != null) parts.push(`$${ev.costUsd.toFixed(4)}`)
        setStatus(`完成（${parts.join(', ')}）`)
        addStep('done', '完成', parts.join(' · '))
        doneMeta.value = { subtype: ev.subtype, durationMs: ev.durationMs, costUsd: ev.costUsd, numTurns: ev.numTurns }
        phase.value = 'done'
        break
      }

      case 'end':
        break
    }
  }

  return {
    phase,
    statusMessage,
    issue,
    steps,
    outputText,
    reviewUrl,
    changedFiles,
    changeAction,
    changeMessage,
    doneMeta,
    resetAnalysis,
    setStatus,
    handleEvent,
  }
})
