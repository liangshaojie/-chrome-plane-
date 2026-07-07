// AgentEvent 类型定义（与 server/src/agent.ts 保持一致）
// status / issue 事件由 analyze 路由发出，其余由 agent 发出

export type AgentEvent =
  | { type: 'status'; message: string }
  | { type: 'issue'; issue: IssueInfo }
  | { type: 'system'; subtype?: string; model?: string; sessionId?: string; cwd?: string; tools?: string[] }
  | { type: 'thinking'; text: string }
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number }
  | { type: 'changes'; files: ChangedFile[] }
  | { type: 'done'; subtype: string; durationMs?: number; costUsd?: number; numTurns?: number }
  | { type: 'error'; message: string }
  | { type: 'saved'; id: number }
  | { type: 'end' }

export interface IssueInfo {
  identifier: string
  title: string
  state?: string
  labels?: string[]
  url: string
}

// Agent 修改后的代码改动文件（与服务端 analyze.ts 的 ChangedFile 保持一致）
export interface ChangedFile {
  path: string
  additions: number
  deletions: number
  diff: string
}

export type EventKind = 'sys' | 'tool' | 'think' | 'text' | 'result' | 'usage' | 'done' | 'err'

export interface Step {
  id: string
  kind: EventKind
  badge: string
  title: string
  body: string
  isOpen: boolean
  toolUseId?: string
  isError?: boolean
}

// 历史记录摘要（GET /history 列表项；字段与后端 API 一致，保持 snake_case）
export interface HistorySummary {
  id: number
  created_at: string
  workspace_slug: string | null
  issue_identifier: string | null
  issue_title: string | null
  issue_url: string | null
  issue_state: string | null
  role: string | null
  status: string
  model: string | null
  duration_ms: number | null
  cost_usd: number | null
  num_turns: number | null
  review_url: string | null
  // 用户对这次改动的处置：null 未处置 | 'committed' 已提交 | 'reverted' 已恢复
  commit_status: string | null
  // 恢复时间（仅 commit_status='reverted' 时有值）
  reverted_at: string | null
}

// 历史记录详情（GET /history/:id）；events 为当时的完整事件流，可重新喂给 handleEvent 还原界面
export interface HistoryRecord extends HistorySummary {
  output_text: string
  events: AgentEvent[]
  changed_files: ChangedFile[]
}
