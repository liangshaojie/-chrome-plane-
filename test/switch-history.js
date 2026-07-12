/**
 * 复刻 Claude Code VS Code 扩展的"切换历史会话"逻辑
 *
 * 真实扩展里的"切换"流程（参考自 extension.js 关键模式）：
 *   1. 侧边栏列出所有 session（通过扫描 projects 目录下的 .jsonl）
 *   2. 用户点击其中一个 → 触发切换
 *   3. 切换时：
 *      - 清空当前内存 store（或创建新的）
 *      - 只加载目标 session 的数据
 *      - 把 sessionId 设为 activeSessionId
 *      - 通知 webview 渲染该 session 的消息
 *   4. CLI 版本对应 `claude --resume <sessionId>` 或 `-r <sessionId>`
 *
 * 本脚本演示：
 *   - node test/switch-history.js                    列出所有 session
 *   - node test/switch-history.js --to <sessionId>   "切换"到指定 session
 *   - node test/switch-history.js --resume <sid>     模拟 --resume 行为
 *   - node test/switch-history.js --interactive      交互式选择
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const readline = require('readline');

// ============== 路径配置 ==============
const HOME = os.homedir();
const PROJECT_PATH = '/Users/lsj/Desktop/anthropic.claude-code-2.1.79-darwin-x64';

function encodeProjectPath(absPath) {
  return absPath.replace(/[\/\.]/g, '-');
}

const PROJECTS_DIR = path.join(HOME, '.claude', 'projects');
const PROJECT_DIR = path.join(PROJECTS_DIR, encodeProjectPath(PROJECT_PATH));

// ============== 内存数据结构（对齐扩展） ==============
class HistoryStore {
  constructor() {
    this.sessionMessages = new Map();
    this.messages = new Map();
    this.summaries = new Map();
    this.fileHistorySnapshots = new Map();
    this.loadedSessions = new Set();
    this.activeSessionId = null; // 当前激活的 session
  }
}

// ============== 工具函数 ==============
async function readJsonlFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    if (!content.trim()) return [];
    return content.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n')
      .replace(/<ide_[^>]+>/g, '')
      .trim();
  }
  return '';
}

/**
 * 渲染一个消息的所有 content block（用于真实 UI 还原）
 * 返回结构化的渲染片段，模拟 webview 里的折叠/展开行为
 */
function renderContentBlocks(content) {
  if (typeof content === 'string') {
    return [{ kind: 'text', text: content.replace(/<ide_[^>]+>/g, '').trim() }];
  }
  if (!Array.isArray(content)) return [];

  const blocks = [];
  for (const block of content) {
    if (block.type === 'text') {
      blocks.push({
        kind: 'text',
        text: (block.text || '').replace(/<ide_[^>]+>/g, '').trim(),
      });
    } else if (block.type === 'thinking') {
      blocks.push({
        kind: 'thinking',
        text: block.thinking || '',
        // 真实 UI 默认折叠，只显示前 100 字预览
        preview: (block.thinking || '').slice(0, 100),
      });
    } else if (block.type === 'tool_use') {
      blocks.push({
        kind: 'tool_use',
        id: block.id,
        name: block.name,
        input: block.input,
      });
    } else if (block.type === 'tool_result') {
      const resultText =
        typeof block.content === 'string'
          ? block.content
          : Array.isArray(block.content)
            ? block.content
                .filter((c) => c.type === 'text')
                .map((c) => c.text)
                .join('\n')
            : JSON.stringify(block.content);
      blocks.push({
        kind: 'tool_result',
        tool_use_id: block.tool_use_id,
        is_error: !!block.is_error,
        text: resultText,
        preview: (resultText || '').slice(0, 200),
      });
    }
  }
  return blocks;
}

function formatInputSummary(input) {
  if (!input || typeof input !== 'object') return '';
  const keys = Object.keys(input);
  if (keys.length === 0) return '{}';
  const parts = keys.map((k) => {
    const v = input[k];
    if (typeof v === 'string') {
      return `${k}="${v.length > 40 ? v.slice(0, 40) + '...' : v}"`;
    }
    return `${k}=${JSON.stringify(v).slice(0, 40)}`;
  });
  return parts.join(' ');
}

// ============== 列出所有 session（轻量扫描） ==============
/**
 * 注意：扩展在侧边栏展示时只需要每个 session 的元数据
 *   （标题、时间、消息数），不需要把所有消息加载到内存
 * 这里只读"前几行"就能拿到 title/cwd/gitBranch/timestamp
 */
async function listSessionsLightweight() {
  let files;
  try {
    files = await fs.readdir(PROJECT_DIR);
  } catch {
    return [];
  }

  const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
  const sessions = [];

  for (const file of jsonlFiles) {
    const filePath = path.join(PROJECT_DIR, file);
    const lines = await readJsonlFile(filePath);
    const sessionId = path.basename(file, '.jsonl');

    const meta = {
      sessionId,
      filePath,
      mtime: (await fs.stat(filePath)).mtime,
      title: null,
      timestamp: null,
      gitBranch: null,
      cwd: null,
      messageCount: 0,
    };

    for (const line of lines) {
      if (line.isSidechain === true) continue;

      if (line.type === 'ai-title' && line.aiTitle) {
        meta.title = line.aiTitle;
      } else if (line.type === 'custom-title' && line.customTitle) {
        meta.title = line.customTitle;
      }

      if (line.type === 'user' && line.message?.role === 'user') {
        if (!meta.timestamp) meta.timestamp = line.timestamp;
        if (!meta.gitBranch) meta.gitBranch = line.gitBranch;
        if (!meta.cwd) meta.cwd = line.cwd;
      }

      if (line.uuid && (line.type === 'user' || line.type === 'assistant')) {
        meta.messageCount++;
      }
    }

    // 兜底标题
    if (!meta.title) meta.title = '(无标题)';
    sessions.push(meta);
  }

  // 按时间倒序（最近的在最前）—— 侧边栏的常见排序
  sessions.sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : a.mtime.getTime();
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : b.mtime.getTime();
    return tb - ta;
  });

  return sessions;
}

// ============== 加载单个 session 到 store（模拟切换的核心） ==============
/**
 * 扩展的行为：
 *   切换 = 新 store（或重置）+ 只加载目标 session + 设 activeSessionId
 */
async function loadSessionIntoStore(store, sessionFile) {
  const sessionId = path.basename(sessionFile, '.jsonl');
  const lines = await readJsonlFile(sessionFile);

  const sessionMsgs = [];
  const fileSnaps = [];
  const summary = {
    customTitle: undefined,
    aiTitle: undefined,
    summary: undefined,
    lastPrompt: undefined,
    timestamp: undefined,
    gitBranch: undefined,
    cwd: undefined,
  };
  let summaryFound = false;

  for (const line of lines) {
    if (line.isSidechain === true) continue;

    if (line.type === 'ai-title' && line.aiTitle) {
      summary.aiTitle = line.aiTitle;
      summaryFound = true;
      continue;
    }
    if (line.type === 'custom-title' && line.customTitle) {
      summary.customTitle = line.customTitle;
      summaryFound = true;
      continue;
    }
    if (line.type === 'summary') {
      summary.summary = line.summary;
      summaryFound = true;
      continue;
    }
    if (line.type === 'last-prompt') {
      summary.lastPrompt = line.lastPrompt || line.prompt || line.text;
      summaryFound = true;
      continue;
    }
    if (line.type === 'file-history-snapshot') {
      fileSnaps.push(line);
      store.fileHistorySnapshots.set(line.messageId, line);
      continue;
    }
    if (line.type === 'user' && line.message?.role === 'user') {
      if (!summary.timestamp) summary.timestamp = line.timestamp;
      if (!summary.gitBranch) summary.gitBranch = line.gitBranch;
      if (!summary.cwd) summary.cwd = line.cwd;
      // 兜底：first user message 的文本作为 lastPrompt
      if (!summary.lastPrompt) {
        const t = extractText(line.message?.content);
        if (t) summary.lastPrompt = t.slice(0, 100);
      }
    }
    if (line.uuid && (line.type === 'user' || line.type === 'assistant')) {
      sessionMsgs.push(line);
    }
  }

  // 写入 store
  store.sessionMessages.set(
    sessionId,
    new Set(sessionMsgs.map((m) => m.uuid))
  );
  for (const m of sessionMsgs) {
    store.messages.set(m.uuid, m);
  }
  if (summaryFound) {
    store.summaries.set(sessionId, summary);
  }
  store.fileHistorySnapshots.size; // 保持引用
  for (const s of fileSnaps) {
    store.fileHistorySnapshots.set(s.messageId, s);
  }
  store.loadedSessions.add(sessionId);

  return { sessionId, messageCount: sessionMsgs.length, summary };
}

/**
 * 切换到指定 session（核心）
 * @param {HistoryStore} store - 当前的内存 store
 * @param {string} targetSessionId - 要切换到的 sessionId
 * @returns {HistoryStore} 新的 store（仅含目标 session）
 */
async function switchToSession(targetSessionId) {
  console.log(`\n🔄 切换 session → ${targetSessionId}`);

  // 1. 验证目标 session 存在
  const targetFile = path.join(PROJECT_DIR, `${targetSessionId}.jsonl`);
  try {
    await fs.access(targetFile);
  } catch {
    throw new Error(`Session 文件不存在: ${targetFile}`);
  }

  // 2. 模拟扩展的"切换"行为：
  //    - 创建全新的 store（丢弃旧的内存数据）
  //    - 只加载目标 session
  //    - 设 activeSessionId
  const newStore = new HistoryStore();
  const result = await loadSessionIntoStore(newStore, targetFile);
  newStore.activeSessionId = targetSessionId;

  console.log(`✅ 已切换到 session: ${result.summary?.customTitle || result.summary?.aiTitle || targetSessionId}`);
  console.log(`   加载消息数: ${result.messageCount}`);
  console.log(`   文件快照:   ${newStore.fileHistorySnapshots.size}`);

  return newStore;
}

// ============== 打印 session 详情（UI 渲染层模拟） ==============
function printActiveSession(store, options = {}) {
  const { showMessages = false, messageLimit } = options;

  if (!store.activeSessionId) {
    console.log('❌ 没有激活的 session');
    return;
  }

  const summary = store.summaries.get(store.activeSessionId);
  const title = summary?.customTitle || summary?.aiTitle || summary?.summary || '(无标题)';

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📌 当前激活 session`);
  console.log(`${'='.repeat(60)}`);
  console.log(`ID:       ${store.activeSessionId}`);
  console.log(`标题:     ${title}`);
  console.log(`时间:     ${summary?.timestamp || '(无)'}`);
  console.log(`分支:     ${summary?.gitBranch || '(无)'}`);
  console.log(`目录:     ${summary?.cwd || '(无)'}`);
  console.log(`消息数:   ${store.sessionMessages.get(store.activeSessionId)?.size || 0}`);

  if (showMessages) {
    const messageIds = store.sessionMessages.get(store.activeSessionId);
    if (!messageIds || messageIds.size === 0) {
      console.log('\n(没有消息)');
      return;
    }

    let messages = [...messageIds]
      .map((id) => store.messages.get(id))
      .filter(Boolean)
      .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
    const totalCount = messages.length;
    if (messageLimit && messageLimit > 0) {
      messages = messages.slice(0, messageLimit);
    }

    console.log(
      messageLimit
        ? `\n📜 消息列表（前 ${messages.length} / 共 ${totalCount} 条）:`
        : `\n📜 消息列表（共 ${totalCount} 条）:`
    );
    console.log('-'.repeat(60));
    for (const msg of messages) {
      const role = (msg.type || 'unknown').toUpperCase();
      const stopReason = msg.message?.stop_reason;
      const stopBadge = stopReason
        ? stopReason === 'end_turn'
          ? ' ✅end'
          : stopReason === 'tool_use'
            ? ' 🔧tool'
            : ` ⏹${stopReason}`
        : ' ⏳streaming';

      console.log(`\n[${role}] ${msg.timestamp}${stopBadge}`);

      // ❗用 renderContentBlocks 替代旧的 extractText
      const blocks = renderContentBlocks(msg.message?.content);
      if (blocks.length === 0) {
        console.log('(空内容)');
        continue;
      }

      for (const block of blocks) {
        if (block.kind === 'text') {
          console.log(block.text || '(空白文本)');
        } else if (block.kind === 'thinking') {
          // 真实 UI 默认折叠
          console.log(`┌─ 💭 Thinking (${block.text.length} 字符) [默认折叠]`);
          console.log(`│  ${block.preview}${block.text.length > 100 ? '...' : ''}`);
          console.log(`└─`);
        } else if (block.kind === 'tool_use') {
          console.log(`┌─ 🔧 ${block.name} [默认折叠]`);
          console.log(`│  id: ${block.id}`);
          console.log(`│  input: ${formatInputSummary(block.input)}`);
          console.log(`└─`);
        } else if (block.kind === 'tool_result') {
          const errMark = block.is_error ? '❌ ERROR' : '✅ OK';
          console.log(`┌─ 📤 ${errMark} [默认折叠]`);
          console.log(`│  tool_use_id: ${block.tool_use_id}`);
          console.log(`│  ${block.preview}${block.text.length > 200 ? '...' : ''}`);
          console.log(`└─`);
        }
      }
    }
  }
}

// ============== 模拟 CLI 的 --resume 行为 ==============
/**
 * 真实 CLI 的 resume 行为：
 *   - 读取指定 session 的完整消息
 *   - 把消息作为 context 发送给 Claude
 *   - 继续对话
 * 这里我们只演示"读取 + 准备 context"这一步
 */
async function resumeSession(sessionId, prompt) {
  console.log(`\n▶️  模拟 --resume ${sessionId}`);
  const store = await switchToSession(sessionId);

  // 提取最后一条 user 消息（用于构造 resume context）
  const messageIds = store.sessionMessages.get(sessionId);
  const messages = [...messageIds]
    .map((id) => store.messages.get(id))
    .filter(Boolean)
    .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

  const lastUserMsg = [...messages].reverse().find((m) => m.type === 'user');

  console.log(`\n📤 Resume context 准备就绪:`);
  console.log(`   - session 消息数: ${messages.length}`);
  console.log(`   - 最后 user 消息: ${lastUserMsg?.timestamp || '(无)'}`);
  console.log(`   - 上下文 tokens:  ~${messages.reduce((acc, m) => acc + extractText(m.message?.content).length, 0)} chars`);
  console.log(`   - 新提示词:       "${prompt || '(无)'}"`);
  console.log(`\n💡 在真实 CLI 中，下一步会把以上 context 发送给 Claude 继续对话`);

  return { store, messages, lastUserMsg };
}

// ============== 交互式选择 ==============
async function interactiveSelect(sessions) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('\n可用的 session:');
  sessions.forEach((s, i) => {
    console.log(`  [${i + 1}] ${s.title}  (${s.messageCount} 条消息, ${s.timestamp || s.mtime.toISOString()})`);
    console.log(`       ID: ${s.sessionId}`);
  });

  return new Promise((resolve) => {
    rl.question('\n选择序号 (输入数字): ', (answer) => {
      rl.close();
      const idx = parseInt(answer, 10) - 1;
      if (idx >= 0 && idx < sessions.length) {
        resolve(sessions[idx]);
      } else {
        console.log('❌ 无效选择');
        resolve(null);
      }
    });
  });
}

// ============== 入口 ==============
(async () => {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const i = args.indexOf(name);
    return i > -1 ? args[i + 1] : null;
  };

  const sessions = await listSessionsLightweight();

  if (sessions.length === 0) {
    console.log('❌ 当前项目下没有找到 session');
    return;
  }

  console.log(`📁 项目历史目录: ${PROJECT_DIR}`);
  console.log(`🔍 发现 ${sessions.length} 个 session\n`);

  // --to <sessionId>  切换到指定 session
  if (args.includes('--to')) {
    const targetId = getArg('--to');
    const store = await switchToSession(targetId);
    printActiveSession(store, { showMessages: true });
    return;
  }

  // --resume <sessionId> [prompt]  模拟 --resume 行为
  if (args.includes('--resume')) {
    const sid = getArg('--resume');
    const prompt = args[args.indexOf('--resume') + 2]; // 可选的 prompt
    await resumeSession(sid, prompt);
    return;
  }

  // --interactive  交互式选择
  if (args.includes('--interactive')) {
    const selected = await interactiveSelect(sessions);
    if (selected) {
      const store = await switchToSession(selected.sessionId);
      printActiveSession(store, { showMessages: true });
    }
    return;
  }

  // 默认：只列出所有 session
  console.log('💡 用法:');
  console.log('  --to <sessionId>           切换到指定 session');
  console.log('  --resume <sessionId>       模拟 --resume 行为');
  console.log('  --interactive              交互式选择');
  console.log('');
  sessions.forEach((s, i) => {
    console.log(`  [${i + 1}] ${s.title}`);
    console.log(`      ID:       ${s.sessionId}`);
    console.log(`      时间:     ${s.timestamp || s.mtime.toISOString()}`);
    console.log(`      消息数:   ${s.messageCount}`);
    console.log(`      分支:     ${s.gitBranch || '(无)'}`);
    console.log('');
  });
})().catch((err) => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});