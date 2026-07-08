<script setup lang="ts">
// 接着追问的对话弹框
// 复用 useChatStore 管理消息 / 状态 / SSE 流
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { marked } from 'marked'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'
import { useAnalysisStore } from '@/stores/analysis'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const chatStore = useChatStore()
const settingsStore = useSettingsStore()
const analysisStore = useAnalysisStore()

const inputText = ref('')
const messagesBodyRef = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const isBusy = computed(() => chatStore.phase === 'sending' || chatStore.phase === 'streaming')

// Markdown 渲染（assistant 消息）
function renderMd(text: string): string {
  if (!text) return ''
  return marked.parse(text, { async: false }) as string
}

// 用户回车发送（Shift+Enter 换行）
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    submit()
  } else if (e.key === 'Escape' && props.open) {
    emit('close')
  }
}

async function submit() {
  const text = inputText.value.trim()
  if (!text || isBusy.value) return
  const ctx = buildCtx()
  if (!ctx) {
    return
  }
  chatStore.addUserMessage(text)
  inputText.value = ''
  await nextTick()
  scrollToBottom()
  await chatStore.send(ctx, settingsStore.serverUrl)
  await nextTick()
  scrollToBottom()
}

function stop() {
  chatStore.stop()
}

function buildCtx(): { analysisId: number | null; workspaceSlug: string; issueIdentifier: string } | null {
  const issue = analysisStore.issue
  if (!issue) {
    chatStore.error = '需要先识别当前 Plane issue 才能追问'
    return null
  }
  return {
    analysisId: analysisStore.historyRecordId,
    workspaceSlug: issue.identifier.split('-')[0] || '',
    issueIdentifier: issue.identifier,
  }
}

// ESC 关闭
function onWindowKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close')
}
onMounted(() => window.addEventListener('keydown', onWindowKey))
onUnmounted(() => window.removeEventListener('keydown', onWindowKey))

// 打开时聚焦输入框 + 重置滚动到底
watch(
  () => props.open,
  async (o) => {
    if (o) {
      await nextTick()
      scrollToBottom()
      textareaRef.value?.focus()
    }
  }
)

// 消息变化时滚到底
watch(
  () => chatStore.messages.length,
  async () => {
    await nextTick()
    scrollToBottom()
  }
)
// 流式 chunk 变化也滚动
watch(
  () => {
    const last = chatStore.messages[chatStore.messages.length - 1]
    return last?.streamingContent ?? ''
  },
  async () => {
    await nextTick()
    scrollToBottom()
  }
)

function scrollToBottom() {
  const el = messagesBodyRef.value
  if (el) el.scrollTop = el.scrollHeight
}

function close() {
  if (isBusy.value) stop()
  emit('close')
}

function fmtMeta(msg: any): string {
  const m = msg.doneMeta
  if (!m) return ''
  const parts: string[] = []
  if (m.durationMs != null) parts.push(`${(m.durationMs / 1000).toFixed(1)}s`)
  if (m.costUsd != null) parts.push(`$${m.costUsd.toFixed(4)}`)
  if (m.numTurns != null) parts.push(`${m.numTurns} 轮`)
  return parts.join(' · ')
}
</script>

<template>
  <div v-if="open" class="chat-backdrop" @click.self="close">
    <div class="chat-dialog" role="dialog" aria-modal="true" aria-labelledby="chat-title">
      <div class="chat-header">
        <div class="title-wrap">
          <h2 id="chat-title">接着追问</h2>
          <span class="sub">developer 模式 · 与 Claude 多轮对话</span>
        </div>
        <button class="close-btn" aria-label="关闭" @click="close">×</button>
      </div>

      <div ref="messagesBodyRef" class="chat-body">
        <div v-if="chatStore.messages.length === 0" class="empty">
          <span class="empty-icon">💬</span>
          <p>还没有对话</p>
          <span class="empty-hint">输入问题开始多轮对话。agent 拥有读写本地代码的能力。</span>
        </div>

        <div v-for="(m, i) in chatStore.messages" :key="i" :class="['msg', `msg-${m.role}`]">
          <div class="msg-meta">
            <span class="role-tag">{{ m.role === 'user' ? '你' : 'Claude' }}</span>
            <span v-if="m.role === 'assistant' && fmtMeta(m)" class="msg-stats">{{ fmtMeta(m) }}</span>
          </div>
          <div class="msg-bubble">
            <template v-if="m.role === 'user'">
              <pre class="msg-text user-text">{{ m.content }}</pre>
            </template>
            <template v-else>
              <div class="msg-text md" v-html="renderMd(m.streamingContent ?? m.content)"></div>
              <span v-if="m.streaming" class="cursor">▍</span>
            </template>
          </div>
        </div>

        <div v-if="chatStore.phase === 'sending'" class="status-hint">连接中…</div>
        <div v-else-if="chatStore.phase === 'streaming'" class="status-hint">Claude 正在思考并回复…</div>
        <div v-else-if="chatStore.phase === 'error' && chatStore.error" class="status-hint error">
          ⚠ {{ chatStore.error }}
        </div>
      </div>

      <div class="chat-footer">
        <textarea
          ref="textareaRef"
          v-model="inputText"
          class="chat-input"
          rows="2"
          placeholder="输入追问，回车发送，Shift+Enter 换行"
          :disabled="isBusy"
          @keydown="onKeydown"
        ></textarea>
        <div class="chat-actions">
          <button v-if="isBusy" class="btn-stop" @click="stop">停止</button>
          <button v-else class="btn-send" :disabled="!inputText.trim()" @click="submit">发送</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
}
.chat-dialog {
  width: 100%;
  max-width: 640px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-card, #1f2937);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  animation: chat-in 0.18s ease-out;
}
@keyframes chat-in {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.title-wrap { display: flex; align-items: baseline; gap: 10px; }
.chat-header h2 { margin: 0; font-size: 15px; font-weight: 600; color: #fff; }
.chat-header .sub { font-size: 11px; color: var(--text-muted); }
.close-btn {
  border: none; background: transparent;
  font-size: 22px; line-height: 1; color: var(--text-muted);
  cursor: pointer; padding: 0 4px;
}
.close-btn:hover { color: #fff; }

.chat-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty {
  padding: 60px 0;
  text-align: center;
  color: var(--text-muted);
}
.empty-icon { font-size: 36px; display: block; margin-bottom: 8px; opacity: 0.6; }
.empty p { margin: 0 0 4px; font-size: 13px; }
.empty-hint { font-size: 11px; opacity: 0.7; }

.msg { display: flex; flex-direction: column; gap: 4px; }
.msg-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-muted);
}
.role-tag {
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
  background: var(--bg-secondary);
}
.msg-user .role-tag { background: var(--primary-bg, rgba(59,130,246,0.18)); color: var(--primary); }
.msg-stats { opacity: 0.8; }

.msg-bubble {
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-size: 13px;
  line-height: 1.6;
}
.msg-user .msg-bubble {
  background: var(--primary-bg, rgba(59,130,246,0.12));
  border-color: rgba(59,130,246,0.3);
}
.msg-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
.user-text {
  font-family: var(--font-mono, monospace);
  font-size: 12.5px;
}
.msg-text.md { white-space: normal; }
.msg-text.md :deep(p) { margin: 0 0 6px; }
.msg-text.md :deep(p:last-child) { margin-bottom: 0; }
.msg-text.md :deep(pre) {
  background: var(--bg-secondary);
  padding: 6px 8px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
}
.msg-text.md :deep(code) {
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  background: var(--bg-secondary);
  padding: 1px 4px;
  border-radius: 3px;
}
.cursor {
  display: inline-block;
  margin-left: 2px;
  color: var(--primary);
  animation: blink 1s steps(2, start) infinite;
}
@keyframes blink {
  to { visibility: hidden; }
}

.status-hint {
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
  padding: 4px;
}
.status-hint.error { color: #f87171; }

.chat-footer {
  display: flex;
  align-items: stretch;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
.chat-input {
  flex: 1;
  resize: none;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}
.chat-input:focus { border-color: var(--primary); }
.chat-input:disabled { opacity: 0.6; cursor: not-allowed; }

.chat-actions {
  display: flex;
  align-items: stretch;
  gap: 6px;
}
.btn-send, .btn-stop {
  padding: 0 14px;
  border-radius: 6px;
  border: 1px solid;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.btn-send {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}
.btn-send:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-stop {
  background: var(--bg-secondary);
  border-color: var(--border);
  color: var(--text);
}
</style>