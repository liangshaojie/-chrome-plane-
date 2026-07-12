/**
 * 复刻 Claude Code VS Code 扩展的历史读取实现
 *
 * 参考自 extension.js 中的关键模式：
 *   - M4.promises.readFile(z, "utf8") 读取 JSONL
 *   - V.split("\n").filter(Boolean) 按行分割
 *   - 跳过 isSidechain: true 的行
 *   - 提取 customTitle / aiTitle / lastPrompt / summary / gitBranch / cwd / timestamp
 *   - 用 sessionMessages / messages / summaries / fileHistorySnapshots 构建内存索引
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// ============== 配置 ==============
const HOME = os.homedir();
const PROJECT_PATH = '/Users/lsj/Desktop/anthropic.claude-code-2.1.79-darwin-x64';

// 扩展的目录编码规则：把绝对路径的 / 和 . 都替换为 -
// 验证：/Users/lsj/Desktop/anthropic.claude-code-2.1.79-darwin-x64
//   -> -Users-lsj-Desktop-anthropic-claude-code-2-1-79-darwin-x64
// 验证：/Users/lsj/.vscode-extensions/anthropic.claude-code-2.1.79-darwin-x64
//   -> -Users-lsj--vscode-extensions-anthropic-claude-code-2-1-79-darwin-x64
function encodeProjectPath(absPath) {
  return absPath.replace(/[\/\.]/g, '-');
}

const CLAUDE_DIR = path.join(HOME, '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const PROJECT_DIR = path.join(PROJECTS_DIR, encodeProjectPath(PROJECT_PATH));

// ============== 扩展的核心数据结构 ==============
class HistoryStore {
  constructor() {
    this.sessionMessages = new Map();   // sessionId -> Set<messageUuid>
    this.messages = new Map();          // uuid -> message object
    this.summaries = new Map();         // sessionId -> summary object
    this.fileHistorySnapshots = new Map(); // messageId -> file snapshot
    this.loadedSessions = new Set();    // 已加载的 sessionId
  }
}

// ============== 复刻 FY(z): 读取单个 JSONL 文件 ==============
/**
 * 扩展源码（去 minify 后）大致是：
 *   async function FY(z) {
 *     try {
 *       let V = await M4.promises.readFile(z, "utf8");
 *       if (!V.trim()) return [];
 *       return V.split("\n").filter((K) => K).map((K) => JSON.parse(K));
 *     } catch { return []; }
 *   }
 */
async function readJsonlFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    if (!content.trim()) return [];
    return content.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch (err) {
    return [];
  }
}

// ============== 复刻扩展的 session 加载逻辑 ==============
/**
 * 扩展源码（去 minify 后）大致是：
 *   // 跳过 sidechain
 *   if (O.includes('"isSidechain":true')) return null;
 *   // 提取标题（优先级：customTitle > aiTitle > lastPrompt > summary）
 *   let B = customTitle || aiTitle || lastPrompt || summary;
 *   // 提取时间戳、git 分支、工作目录
 *   let W = timestamp, H = gitBranch, L = cwd;
 *   // 加载进内存
 *   sessionMessages.set(N, new Set(H.map(F => F.uuid)));
 *   messages.set(F.uuid, F);
 *   summaries.set(A, B);
 *   loadedSessions.add(N);
 */
async function loadSession(store, sessionFile) {
  const sessionId = path.basename(sessionFile, '.jsonl');
  const lines = await readJsonlFile(sessionFile);

  const sessionMessages = [];      // 消息列表
  const fileSnapshots = [];        // 文件快照
  const summary = {
    customTitle: undefined,
    aiTitle: undefined,
    lastPrompt: undefined,
    summary: undefined,
    timestamp: undefined,
    gitBranch: undefined,
    cwd: undefined,
  };
  let summaryFound = false;

  for (const line of lines) {
    // 跳过 sub-agent 分支对话
    if (line.isSidechain === true) continue;

    // 收集 ai-title / custom-title / summary
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
      if (line.leafUuid) summaryFound = true;
      continue;
    }

    // 收集文件历史快照
    if (line.type === 'file-history-snapshot') {
      fileSnapshots.push(line);
      store.fileHistorySnapshots.set(line.messageId, line);
      continue;
    }

    // 从第一条 user 消息提取 cwd/gitBranch/timestamp/lastPrompt
    if (line.type === 'user' && line.message?.role === 'user') {
      if (!summary.timestamp) summary.timestamp = line.timestamp;
      if (!summary.gitBranch) summary.gitBranch = line.gitBranch;
      if (!summary.cwd) summary.cwd = line.cwd;
      // lastPrompt = 第一条 user 消息的文本预览
      if (!summary.lastPrompt) {
        const content = line.message?.content;
        if (typeof content === 'string') {
          summary.lastPrompt = content.slice(0, 80);
        } else if (Array.isArray(content)) {
          const text = content
            .filter((c) => c.type === 'text')
            .map((c) => c.text)
            .join(' ')
            .replace(/<ide_[^>]+>/g, '')
            .trim();
          summary.lastPrompt = text.slice(0, 80);
        }
      }
    }

    // 收集消息（user / assistant）
    if (line.uuid && (line.type === 'user' || line.type === 'assistant')) {
      sessionMessages.push(line);
    }
  }

  // 写入 store（模拟扩展的 Maps）
  store.sessionMessages.set(
    sessionId,
    new Set(sessionMessages.map((m) => m.uuid))
  );
  for (const m of sessionMessages) {
    store.messages.set(m.uuid, m);
  }
  for (const snap of fileSnapshots) {
    store.fileHistorySnapshots.set(snap.messageId, snap);
  }
  if (summaryFound) {
    store.summaries.set(sessionId, summary);
  }
  store.loadedSessions.add(sessionId);

  return {
    sessionId,
    messageCount: sessionMessages.length,
    summary: summaryFound ? summary : null,
  };
}

// ============== 主流程：列出当前项目所有 session ==============
async function listAllSessions() {
  const store = new HistoryStore();

  console.log('📁 项目历史目录:', PROJECT_DIR);
  console.log('---');

  let files;
  try {
    files = await fs.readdir(PROJECT_DIR);
  } catch (err) {
    console.error('❌ 目录不存在:', err.message);
    return store;
  }

  const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
  console.log(`🔍 发现 ${jsonlFiles.length} 个 session\n`);

  for (const file of jsonlFiles) {
    const filePath = path.join(PROJECT_DIR, file);
    const result = await loadSession(store, filePath);

    const s = result.summary;
    const title =
      s?.customTitle ||
      s?.aiTitle ||
      s?.lastPrompt ||
      s?.summary ||
      '(无标题)';

    console.log(`📝 ${result.sessionId}`);
    console.log(`   标题:    ${title}`);
    console.log(`   时间:    ${s?.timestamp || '(未知)'}`);
    console.log(`   消息数:  ${result.messageCount}`);
    console.log(`   分支:    ${s?.gitBranch || '(无)'}`);
    console.log(`   目录:    ${s?.cwd || '(无)'}`);
    console.log('');
  }

  console.log('---');
  console.log('📊 内存索引统计:');
  console.log(`   loadedSessions:      ${store.loadedSessions.size}`);
  console.log(`   sessionMessages:    ${store.sessionMessages.size} 个 session`);
  console.log(`   messages:           ${store.messages.size} 条消息`);
  console.log(`   summaries:          ${store.summaries.size} 个摘要`);
  console.log(`   fileHistorySnapshots: ${store.fileHistorySnapshots.size} 个快照`);

  return store;
}

// ============== 可选：读取某个 session 的完整对话 ==============
async function printSessionDetail(store, sessionId) {
  const messageIds = store.sessionMessages.get(sessionId);
  if (!messageIds) {
    console.error(`❌ 找不到 session: ${sessionId}`);
    return;
  }

  console.log(`\n📖 Session ${sessionId} 的完整对话:`);
  console.log('=====================================');

  // 按时间排序
  const messages = [...messageIds]
    .map((id) => store.messages.get(id))
    .filter(Boolean)
    .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

  for (const msg of messages) {
    const role = msg.type || 'unknown';
    const content = msg.message?.content;
    let text = '';
    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n');
    }
    // 去掉 <ide_*> 标签的干扰
    text = text.replace(/<ide_[^>]+>/g, '').trim();

    console.log(`\n[${role.toUpperCase()}] ${msg.timestamp}`);
    console.log(text.slice(0, 500) + (text.length > 500 ? '...' : ''));
  }
}

// ============== 入口 ==============
(async () => {
  const store = await listAllSessions();

  // 如果命令行带 --detail <sessionId>，打印该 session 详情
  const detailIdx = process.argv.indexOf('--detail');
  if (detailIdx > -1 && process.argv[detailIdx + 1]) {
    await printSessionDetail(store, process.argv[detailIdx + 1]);
  }
})();