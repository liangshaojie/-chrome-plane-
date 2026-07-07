import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AgentEvent, IssueInfo, Step, EventKind, ChangedFile, HistoryRecord } from '@/types/events'

/**
 * 用户角色类型 - 与后端 prompts.ts 中的 UserRole 保持一致
 * - developer: 开发者 - 修改代码并提交
 * - tester: 测试人员 - 设计测试场景和用例覆盖
 * - business: 业务人员 - 用通俗语言描述问题
 */
export type UserRole = 'developer' | 'tester' | 'business'

export const USER_ROLES: { value: UserRole; label: string; icon: string }[] = [
  { value: 'developer', label: '开发者', icon: '💻' },
  { value: 'tester', label: '测试人员', icon: '🧪' },
  { value: 'business', label: '业务人员', icon: '👔' },
]

function truncate(str: string | null | undefined, n = 120): string {
  if (!str) return ''
  const one = String(str).replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n) + '…' : one
}

let stepIdCounter = 0

/**
 * 显示态：UI 实际渲染的数据（任一时刻要么来自 live、要么来自历史、要么为空）。
 * 与 analysis store 的 ref 解耦，让 applyEventToDisplay 能跑在普通对象上。
 */
export interface DisplayState {
  phase: 'idle' | 'analyzing' | 'done' | 'error'
  statusMessage: string
  issue: IssueInfo | null
  steps: Step[]
  outputText: string
  reviewUrl: string
  changedFiles: ChangedFile[]
  doneMeta: { subtype?: string; durationMs?: number; costUsd?: number; numTurns?: number } | null
}

function freshDisplay(): DisplayState {
  return {
    phase: 'idle',
    statusMessage: '',
    issue: null,
    steps: [],
    outputText: '',
    reviewUrl: '',
    changedFiles: [],
    doneMeta: null,
  }
}

/**
 * 把单个事件应用到显示态。
 * 副作用：追加 step、追加 outputText、设置 issue/doneMeta、phase 切换等。
 *
 * 注意：
 * - 这是一个"纯函数式"的副作用——所有可变结构都通过 ds.* 直接读写；
 * - 不再依赖 store 闭包，因此同一份事件既能喂给 UI、也能喂给 live 快照，互不干扰。
 */
export function applyEventToDisplay(
  ds: DisplayState,
  ev: AgentEvent,
  ctx: { stepByToolId: Map<string, number>; nextStepId: () => number }
): void {
  const addStep = (kind: EventKind, badge: string, title: string, body = '', toolUseId?: string, isError = false): number => {
    const id = `step-${ctx.nextStepId()}`
    const idx = ds.steps.length
    ds.steps.push({ id, kind, badge, title, body, isOpen: false, toolUseId, isError })
    if (toolUseId) ctx.stepByToolId.set(toolUseId, idx)
    return idx
  }

  switch (ev.type) {
    case 'status':
      ds.statusMessage = ev.message
      addStep('sys', '状态', ev.message)
      break

    case 'issue':
      ds.issue = ev.issue
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
      ds.outputText += ev.text
      addStep('text', '回答', truncate(ev.text, 80), ev.text)
      break

    case 'tool_use': {
      const inputStr = typeof ev.input === 'string' ? ev.input : JSON.stringify(ev.input, null, 2)
      const summary = truncate(typeof ev.input === 'string' ? ev.input : JSON.stringify(ev.input), 80)
      addStep('tool', `🔧 ${ev.name}`, summary || '(无参数)', inputStr, ev.id)
      break
    }

    case 'tool_result': {
      const idx = ctx.stepByToolId.get(ev.toolUseId)
      const preview = truncate(ev.content, 80)
      if (idx !== undefined) {
        const step = ds.steps[idx]
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
      ds.statusMessage = ev.message
      addStep('err', '错误', ev.message, ev.message)
      ds.phase = 'error'
      break

    case 'changes':
      ds.changedFiles = ev.files
      addStep('done', '代码改动', `共 ${ev.files.length} 个文件被修改，等待确认`)
      break

    case 'done': {
      const parts: string[] = [`subtype=${ev.subtype}`]
      if (ev.numTurns != null) parts.push(`turns=${ev.numTurns}`)
      if (ev.durationMs != null) parts.push(`${(ev.durationMs / 1000).toFixed(1)}s`)
      if (ev.costUsd != null) parts.push(`$${ev.costUsd.toFixed(4)}`)
      ds.statusMessage = `完成（${parts.join(', ')}）`
      addStep('done', '完成', parts.join(' · '))
      ds.doneMeta = { subtype: ev.subtype, durationMs: ev.durationMs, costUsd: ev.costUsd, numTurns: ev.numTurns }
      ds.phase = 'done'
      break
    }

    case 'end':
    case 'saved':
      // 纯结构性事件，不影响 UI 展示
      break
  }
}

/**
 * live 快照状态：
 * - phase: 'analyzing' 还在跑 | 'done' 跑完了（可点开回看，UI 提示"新完成"）| null 没有进行中的分析
 * - startedAt: 开始时间戳（用于显示已耗时）
 * - role: 当时的角色
 * - display: 已累积的显示态副本
 * - pendingEvents: 当前 UI 不在 live 时（点了历史），累积期间的事件；切回 live 时一并补播
 */
export interface LiveSnapshot {
  phase: 'analyzing' | 'done'
  startedAt: number
  role: UserRole
  display: DisplayState
  pendingEvents: AgentEvent[]
}

export const useAnalysisStore = defineStore('analysis', () => {
  // ----- UI 当前显示 -----
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
  // 当前用户角色（默认业务人员，避免同事误选到「开发者」/代码改动入口）
  const role = ref<UserRole>('business')
  // 是否正在查看历史记录（true 时提示"历史模式"，开始新分析会自动退出）
  const isHistoryView = ref(false)

  // ----- Live 快照（独立于 UI 显示）-----
  const live = ref<LiveSnapshot | null>(null)
  // 当前 UI 是不是显示 live
  const viewingLive = ref(false)

  const stepByToolId = new Map<string, number>()
  const liveStepByToolId = new Map<string, number>()

  function nextStepId(): number {
    return ++stepIdCounter
  }

  /** 把任意 DisplayState 同步到 UI 的 ref（数组/对象深拷贝，避免后续写入污染源） */
  function paintDisplay(ds: DisplayState) {
    phase.value = ds.phase
    statusMessage.value = ds.statusMessage
    issue.value = ds.issue ? { ...ds.issue } : null
    steps.value = ds.steps.map((s) => ({ ...s }))
    outputText.value = ds.outputText
    reviewUrl.value = ds.reviewUrl
    changedFiles.value = ds.changedFiles.map((f) => ({ ...f }))
    doneMeta.value = ds.doneMeta ? { ...ds.doneMeta } : null
  }

  function clearUiStepMap() {
    stepByToolId.clear()
  }

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
    clearUiStepMap()
    isHistoryView.value = false
    viewingLive.value = false
  }

  function setStatus(msg: string) {
    statusMessage.value = msg
  }

  /**
   * 处理 SSE 事件。
   * 关键：无论 UI 当前显示的是 live 还是 history，事件始终喂给 live 快照；
   * 仅当 UI 当前就在 live 视图时，才同步渲染到 UI。
   */
  function handleEvent(ev: AgentEvent) {
    // 1) 始终更新 live 快照（live 不存在就忽略——"已结束/未启动"的旧调用）
    const ls = live.value
    if (!ls) return

    applyEventToDisplay(ls.display, ev, {
      stepByToolId: liveStepByToolId,
      nextStepId,
    })
    if (ev.type === 'done' || ev.type === 'error') ls.phase = 'done'

    // UI 不在 live 视图（点了历史）：事件压入 pending，等切回时丢弃（live.display 已反映）
    if (!viewingLive.value) {
      ls.pendingEvents.push(ev)
      return
    }

    // 2) UI 就在 live 视图 → 同步渲染到 UI refs
    //    注意：ds 必须用独立的数组/对象，不能直接持有 live.display / UI refs 的引用，
    //    否则 applyEventToDisplay 写入 ds.steps 时会同时改到 live 数组，导致重复渲染。
    const ds: DisplayState = {
      phase: phase.value,
      statusMessage: statusMessage.value,
      issue: issue.value,
      steps: [...steps.value],
      outputText: outputText.value,
      reviewUrl: reviewUrl.value,
      changedFiles: [...changedFiles.value],
      doneMeta: doneMeta.value ? { ...doneMeta.value } : null,
    }
    applyEventToDisplay(ds, ev, { stepByToolId, nextStepId })
    paintDisplay(ds)
  }

  function setRole(newRole: UserRole) {
    role.value = newRole
  }

  /**
   * useSSE 启动分析时调用：建立新的 live 快照，UI 自动切到 live 视图。
   */
  function beginLive(currentRole: UserRole) {
    resetAnalysis()
    viewingLive.value = true
    const ls: LiveSnapshot = {
      phase: 'analyzing',
      startedAt: Date.now(),
      role: currentRole,
      display: freshDisplay(),
      pendingEvents: [],
    }
    // 初始化 UI 镜像
    paintDisplay(ls.display)
    // phase 显示为 analyzing
    phase.value = 'analyzing'
    statusMessage.value = '准备开始分析…'
    live.value = ls
    liveStepByToolId.clear()
  }

  /** useSSE finally 调用：标记 live 阶段为 done（UI 上仍有"新完成"提示） */
  function endLive() {
    if (live.value) live.value.phase = 'done'
  }

  /**
   * 主动清掉 live 快照（用户点了「收起」）。
   * 注意：不影响 UI 当前显示（如果 UI 正在看 live，会切回空态）；
   * 已落库的真实记录仍在历史列表里。
   */
  function clearLive() {
    if (viewingLive.value) resetAnalysis()
    live.value = null
    liveStepByToolId.clear()
  }

  /**
   * 用户点「停止」后调用：清空当前分析的步骤记录、结果、代码改动；
   * 保留 statusMessage 里的「已停止」文案 + issue 信息；
   * 同时丢弃 live 快照（本次分析不落库）。
   */
  function abortAndClear() {
    // 清 UI 显示态：保留 phase=analyzing（让进度条区域占位也保留）与 statusMessage
    // 以及 issue（已经拉到了）+ role；其他步骤类信息全部清空
    phase.value = 'idle'
    steps.value = []
    outputText.value = ''
    reviewUrl.value = ''
    changedFiles.value = []
    changeAction.value = ''
    changeMessage.value = ''
    doneMeta.value = null
    isHistoryView.value = false
    viewingLive.value = false
    clearUiStepMap()
    // 丢 live 快照（已落库的不动，本次放弃）
    live.value = null
    liveStepByToolId.clear()
  }

  /**
   * 把 UI 切到 live 视图。如果当前不在 live（点了历史），把 live 快照同步到 UI。
   * 如果没有 live 快照则 no-op。
   */
  function showLive() {
    const ls = live.value
    if (!ls) return
    viewingLive.value = true
    isHistoryView.value = false
    paintDisplay(ls.display)
    phase.value = ls.display.phase === 'error' ? 'error' : ls.phase === 'done' ? 'done' : 'analyzing'
    // 重建 UI 端的 stepByToolId（基于 paint 后的 steps）
    clearUiStepMap()
    steps.value.forEach((s, idx) => {
      if (s.toolUseId) stepByToolId.set(s.toolUseId, idx)
    })
    // 期间累积的事件已在 ls.display 里反映过（handleEvent 同步写入），这里清空计数
    ls.pendingEvents = []
  }

  /**
   * 加载一条历史记录：重放事件流还原 steps/结果/改动，并标记为历史视图。
   * 注意：不再 resetAnalysis()——那样会清掉 live 快照；这里只重置"显示态"层。
   */
  function loadHistoryRecord(record: HistoryRecord) {
    isHistoryView.value = true
    viewingLive.value = false
    const ds = freshDisplay()
    const tmpStepByToolId = new Map<string, number>()
    for (const ev of record.events) {
      applyEventToDisplay(ds, ev, { stepByToolId: tmpStepByToolId, nextStepId })
    }
    // 兜底：事件流缺 text/changes 时用详情字段补
    if (!ds.outputText && record.output_text) ds.outputText = record.output_text
    if (ds.changedFiles.length === 0 && record.changed_files?.length) {
      ds.changedFiles = record.changed_files
    }
    ds.phase = record.status === 'error' ? 'error' : 'done'
    ds.statusMessage = `历史记录 · ${record.issue_identifier ?? ds.issue?.identifier ?? ''}`
    paintDisplay(ds)
    clearUiStepMap()
  }

  /** 是否"还有进行中的分析"——供 HistoryPanel 显示 live 行 */
  const hasLive = computed(() => !!live.value)

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
    role,
    isHistoryView,
    // live 相关
    live,
    hasLive,
    viewingLive,
    setRole,
    loadHistoryRecord,
    resetAnalysis,
    setStatus,
    handleEvent,
    beginLive,
    endLive,
    showLive,
    clearLive,
    abortAndClear,
  }
})