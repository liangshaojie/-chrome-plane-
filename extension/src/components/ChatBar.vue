<script setup lang="ts">
// 插件底部的「接着追问」常驻输入栏
// 仅在 developer 角色时显示，分析进行中不可用
// 消息面板可展开/收起
import { ref, computed, watch, nextTick } from 'vue'
import { marked } from 'marked'
import { useChatStore, type ChatImage } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'
import { useAnalysisStore } from '@/stores/analysis'

const chatStore = useChatStore()
const settingsStore = useSettingsStore()
const analysisStore = useAnalysisStore()

const inputText = ref('')
const messagesBodyRef = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const expanded = ref(false)

// 待发送的图片
const pendingImages = ref<ChatImage[]>([])

// 分析进行中（初始分析 or chat 进行中）不可用
// 注意：chatStore.phase === 'error' 时不禁用，允许用户重试
const isAnalysisRunning = computed(() => analysisStore.phase === 'analyzing')
const isChatBusy = computed(() => chatStore.phase === 'sending' || chatStore.phase === 'streaming')
const isDisabled = computed(() => isAnalysisRunning.value || isChatBusy.value)
const hasMessages = computed(() => chatStore.messages.length > 0)

// 仅 developer 角色才显示
const visible = computed(() => analysisStore.role === 'developer')

function renderMd(text: string): string {
  if (!text) return ''
  return marked.parse(text, { async: false }) as string
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    submit()
  }
}

async function submit() {
  const text = inputText.value.trim()
  if ((!text && !pendingImages.value.length) || isDisabled.value) return
  const ctx = buildCtx()
  if (!ctx) return
  const images = pendingImages.value.length ? [...pendingImages.value] : undefined
  const msgText = text || '(图片)'
  chatStore.addUserMessage(msgText, images)
  inputText.value = ''
  pendingImages.value = []
  // 自动展开消息面板
  expanded.value = true
  await nextTick()
  scrollToBottom()
  await chatStore.send(ctx, settingsStore.serverUrl, images)
  await nextTick()
  scrollToBottom()
}

function stop() {
  chatStore.stop()
}

function buildCtx() {
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

function toggleExpand() {
  expanded.value = !expanded.value
  if (expanded.value) {
    nextTick(() => scrollToBottom())
  }
}

// 图片
function onAttachClick() {
  fileInputRef.value?.click()
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length) return
  await addFiles(input.files)
  input.value = ''
}

async function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  const imageFiles: File[] = []
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) imageFiles.push(file)
    }
  }
  if (imageFiles.length) {
    e.preventDefault()
    await addFiles(imageFiles)
  }
}

async function addFiles(files: File[] | FileList) {
  for (const file of Array.from(files)) {
    if (!file.type.startsWith('image/')) continue
    if (file.size > 5 * 1024 * 1024) {
      chatStore.error = `图片 ${file.name} 超过 5MB 限制`
      continue
    }
    const base64 = await fileToBase64(file)
    const mimeType = (file.type || 'image/png') as ChatImage['mimeType']
    pendingImages.value.push({
      filename: file.name || 'paste.png',
      data: base64,
      mimeType,
    })
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const idx = result.indexOf(',')
      resolve(idx >= 0 ? result.slice(idx + 1) : result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function removePendingImage(i: number) {
  pendingImages.value.splice(i, 1)
}

function pendingImageUrl(img: ChatImage): string {
  return `data:${img.mimeType};base64,${img.data}`
}

function msgImageUrl(img: ChatImage): string {
  return `data:${img.mimeType};base64,${img.data}`
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

// 消息变化时滚到底
watch(
  () => chatStore.messages.length,
  async () => {
    if (expanded.value) {
      await nextTick()
      scrollToBottom()
    }
  }
)
watch(
  () => {
    const last = chatStore.messages[chatStore.messages.length - 1]
    return last?.streamingContent ?? ''
  },
  async () => {
    if (expanded.value) {
      await nextTick()
      scrollToBottom()
    }
  }
)

function scrollToBottom() {
  const el = messagesBodyRef.value
  if (el) el.scrollTop = el.scrollHeight
}

// 有新消息时自动展开
watch(
  () => chatStore.messages.length,
  (n) => {
    if (n > 0 && !expanded.value) expanded.value = true
  }
)

// 分析中禁用提示
const disabledHint = computed(() => {
  if (isAnalysisRunning.value) return '分析进行中，请稍后'
  return ''
})
</script>

<template>
  <div v-if="visible" class="chat-bar">
    <!-- 消息面板（可展开/收起） -->
    <div v-if="expanded && hasMessages" class="chat-messages">
      <div class="messages-header">
        <span class="messages-title">对话记录</span>
        <button class="collapse-btn" @click="toggleExpand" title="收起">▾</button>
      </div>
      <div ref="messagesBodyRef" class="messages-body">
        <div v-for="(m, i) in chatStore.messages" :key="i" :class="['msg', `msg-${m.role}`]">
          <div class="msg-meta">
            <span class="role-tag">{{ m.role === 'user' ? '你' : 'Claude' }}</span>
            <span v-if="m.role === 'assistant' && fmtMeta(m)" class="msg-stats">{{ fmtMeta(m) }}</span>
          </div>
          <div class="msg-bubble">
            <template v-if="m.role === 'user'">
              <pre class="msg-text user-text">{{ m.content }}</pre>
              <div v-if="m.images?.length" class="msg-images">
                <img v-for="(img, j) in m.images" :key="j" :src="msgImageUrl(img)" :alt="img.filename" class="msg-img" />
              </div>
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
    </div>

    <!-- 待发送图片预览 -->
    <div v-if="pendingImages.length" class="pending-images">
      <div v-for="(img, i) in pendingImages" :key="i" class="pending-img-wrap">
        <img :src="pendingImageUrl(img)" :alt="img.filename" class="pending-img" />
        <button class="remove-img-btn" @click="removePendingImage(i)" title="移除">×</button>
      </div>
    </div>

    <!-- 输入栏 -->
    <div class="chat-input-row">
      <button
        v-if="hasMessages && !expanded"
        class="btn-expand"
        title="展开对话记录"
        @click="toggleExpand"
      >▴</button>
      <button
        class="btn-attach"
        :disabled="isDisabled"
        title="添加图片"
        @click="onAttachClick"
      >📎</button>
      <textarea
        ref="textareaRef"
        v-model="inputText"
        class="chat-input"
        rows="1"
        :placeholder="disabledHint || '接着追问，回车发送，Shift+Enter 换行，Ctrl+V 粘贴图片'"
        :disabled="isDisabled"
        @keydown="onKeydown"
        @paste="onPaste"
      ></textarea>
      <button v-if="isChatBusy" class="btn-stop" @click="stop">停止</button>
      <button v-else class="btn-send" :disabled="isDisabled || (!inputText.trim() && !pendingImages.length)" @click="submit">发送</button>
      <!-- 隐藏文件输入 -->
      <input
        ref="fileInputRef"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        style="display: none"
        @change="onFileChange"
      />
    </div>

    <!-- 分析中遮罩提示 -->
    <div v-if="isAnalysisRunning" class="disabled-overlay">
      <span>分析进行中，追问不可用</span>
    </div>
  </div>
</template>

<style scoped>
.chat-bar {
  position: relative;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
  background: var(--bg-card, #1a1f2e);
  flex-shrink: 0;
}

/* 消息面板 */
.chat-messages {
  display: flex;
  flex-direction: column;
  max-height: 45vh;
  border-bottom: 1px solid var(--border);
}
.messages-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.messages-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}
.collapse-btn {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  padding: 4px 8px;
}
.collapse-btn:hover { color: var(--text); }

.messages-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 消息气泡 */
.msg { display: flex; flex-direction: column; gap: 3px; }
.msg-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-muted);
}
.role-tag {
  padding: 2px 6px;
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
.msg-text.md :deep(p) { margin: 0 0 4px; }
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
@keyframes blink { to { visibility: hidden; } }

.status-hint {
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
  padding: 4px;
}
.status-hint.error { color: #f87171; }

.msg-images {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.msg-img {
  max-width: 150px;
  max-height: 150px;
  border-radius: 4px;
  border: 1px solid var(--border);
}

/* 待发送图片 */
.pending-images {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 12px 0;
}
.pending-img-wrap { position: relative; display: inline-block; }
.pending-img {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid var(--border);
}
.remove-img-btn {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: none;
  background: rgba(0,0,0,0.7);
  color: #fff;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.remove-img-btn:hover { background: var(--error); }

/* 输入行 */
.chat-input-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 12px;
}
.chat-input {
  flex: 1;
  resize: none;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  outline: none;
  transition: border-color 0.15s;
  max-height: 100px;
}
.chat-input:focus { border-color: var(--primary); }
.chat-input:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-expand {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--primary);
  cursor: pointer;
  font-size: 14px;
}
.btn-expand:hover { background: var(--primary-bg, rgba(59,130,246,0.12)); }

.btn-attach {
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  font-size: 16px;
  cursor: pointer;
}
.btn-attach:hover:not(:disabled) { border-color: var(--primary); }
.btn-attach:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-send, .btn-stop {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.btn-send {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}
.btn-send:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-stop {
  background: var(--bg-secondary);
  border-color: var(--border);
  color: var(--text);
}

/* 分析中遮罩 */
.disabled-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  color: var(--text-muted);
  pointer-events: none;
  z-index: 10;
  backdrop-filter: blur(1px);
}
</style>
