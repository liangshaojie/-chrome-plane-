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
  | { type: 'done'; subtype: string; durationMs?: number; costUsd?: number; numTurns?: number }
  | { type: 'error'; message: string }
  | { type: 'end' }

export interface IssueInfo {
  identifier: string
  title: string
  state?: string
  labels?: string[]
  url: string
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
