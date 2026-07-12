/**
 * 渲染细节分析器：把 JSONL 里所有需要给渲染层用的字段全部拆解出来
 *
 * 目的：
 *   排查"为什么 webview 渲染会出问题"——通常是因为没识别出
 *   某种 content block 类型，或者漏了某个字段。
 *
 * 用法：
 *   node test/rendering-details.js                       # 当前项目第一个 session
 *   node test/rendering-details.js --session <id>        # 指定 session
 *   node test/rendering-details.js --session <id> --detail <msgIdx>
 *                                                       # 打印第 N 条消息的完整字段
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const PROJECT_PATH = '/Users/lsj/Desktop/anthropic.claude-code-2.1.79-darwin-x64';
function encodeProjectPath(p) { return p.replace(/[\/\.]/g, '-'); }
const PROJECT_DIR = path.join(HOME, '.claude', 'projects', encodeProjectPath(PROJECT_PATH));

async function readJsonl(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    if (!content.trim()) return [];
    return content.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

// ============== 全字段扫描 ==============
async function analyzeSession(sessionFile) {
  const lines = await readJsonl(sessionFile);
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📂 文件: ${sessionFile}`);
  console.log(`📊 总行数: ${lines.length}`);
  console.log(`${'='.repeat(70)}\n`);

  // ----- 1. 顶层 type 分布 -----
  console.log('━━━ 1. 顶层 type 分布（决定渲染哪种组件）━━━');
  const topTypes = {};
  for (const line of lines) {
    const t = line.type || '(none)';
    topTypes[t] = (topTypes[t] || 0) + 1;
  }
  for (const [t, c] of Object.entries(topTypes).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t.padEnd(28)} ${c}`);
  }

  // ----- 2. content block 类型分布 -----
  console.log('\n━━━ 2. content block 类型分布（消息体里的子结构）━━━');
  const blockTypes = {};
  for (const line of lines) {
    const content = line.message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        const t = block.type || '(none)';
        blockTypes[t] = (blockTypes[t] || 0) + 1;
      }
    } else if (typeof content === 'string') {
      blockTypes['(string)'] = (blockTypes['(string)'] || 0) + 1;
    }
  }
  if (Object.keys(blockTypes).length === 0) {
    console.log('  (没有 content blocks)');
  } else {
    for (const [t, c] of Object.entries(blockTypes).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${t.padEnd(28)} ${c}`);
    }
  }

  // ----- 3. 用过的工具列表（tool_use.name） -----
  console.log('\n━━━ 3. 用过的工具（tool_use.name）━━━');
  const tools = {};
  for (const line of lines) {
    const content = line.message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'tool_use') {
          tools[block.name] = (tools[block.name] || 0) + 1;
        }
      }
    }
  }
  if (Object.keys(tools).length === 0) {
    console.log('  (没有工具调用)');
  } else {
    for (const [t, c] of Object.entries(tools).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${t.padEnd(28)} ${c} 次`);
    }
  }

  // ----- 4. 消息关键字段覆盖率 -----
  console.log('\n━━━ 4. 关键字段覆盖率（这些字段 webview 经常要用）━━━');
  const fields = [
    'uuid', 'parentUuid', 'isSidechain', 'sessionId', 'timestamp',
    'gitBranch', 'cwd', 'permissionMode', 'userType', 'entrypoint', 'version',
    'promptId', 'toolUseResult', 'isMeta', 'isCompactSummary', 'isVirtual',
    'stop_reason', 'model',
  ];
  const fieldStats = {};
  for (const f of fields) fieldStats[f] = { yes: 0, no: 0, samples: [] };

  for (const line of lines) {
    for (const f of fields) {
      if (line[f] !== undefined && line[f] !== null) {
        fieldStats[f].yes++;
        if (fieldStats[f].samples.length < 2) {
          const v = JSON.stringify(line[f]);
          fieldStats[f].samples.push(v.length > 50 ? v.slice(0, 50) + '...' : v);
        }
      } else {
        fieldStats[f].no++;
      }
    }
  }
  for (const f of fields) {
    const s = fieldStats[f];
    const pct = lines.length ? ((s.yes / lines.length) * 100).toFixed(0) : 0;
    console.log(`  ${f.padEnd(18)} ${String(s.yes).padStart(4)} / ${lines.length}  (${pct}%)`);
    if (s.samples.length) {
      s.samples.forEach((v) => console.log(`      例: ${v}`));
    }
  }

  // ----- 5. message.* 关键字段 -----
  console.log('\n━━━ 5. message.* 字段（消息体里的元数据）━━━');
  const msgFields = ['role', 'model', 'id', 'stop_reason', 'stop_sequence', 'usage', 'error'];
  const msgStats = {};
  for (const f of msgFields) msgStats[f] = { yes: 0, samples: [] };

  for (const line of lines) {
    if (!line.message) continue;
    for (const f of msgFields) {
      if (line.message[f] !== undefined && line.message[f] !== null) {
        msgStats[f].yes++;
        if (msgStats[f].samples.length < 2) {
          const v = JSON.stringify(line.message[f]);
          msgStats[f].samples.push(v.length > 60 ? v.slice(0, 60) + '...' : v);
        }
      }
    }
  }
  for (const f of msgFields) {
    const s = msgStats[f];
    if (s.yes === 0) {
      console.log(`  ${f.padEnd(18)} 0`);
    } else {
      console.log(`  ${f.padEnd(18)} ${s.yes}`);
      s.samples.forEach((v) => console.log(`      例: ${v}`));
    }
  }

  // ----- 6. tool_use 块的 input schema 类型 -----
  console.log('\n━━━ 6. 工具调用 input 的字段（不同工具 schema 不同）━━━');
  const inputKeysByTool = {};
  for (const line of lines) {
    const content = line.message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'tool_use' && block.input) {
          if (!inputKeysByTool[block.name]) inputKeysByTool[block.name] = new Set();
          for (const k of Object.keys(block.input)) {
            inputKeysByTool[block.name].add(k);
          }
        }
      }
    }
  }
  if (Object.keys(inputKeysByTool).length === 0) {
    console.log('  (无)');
  } else {
    for (const [tool, keys] of Object.entries(inputKeysByTool)) {
      console.log(`  ${tool}:`);
      for (const k of keys) console.log(`      - ${k}`);
    }
  }

  // ----- 7. tool_result 块的状态 -----
  console.log('\n━━━ 7. tool_result 的状态分布（成功/失败/截断）━━━');
  const resultStats = { total: 0, is_error: 0, has_content: 0, truncated: 0 };
  for (const line of lines) {
    const content = line.message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'tool_result') {
          resultStats.total++;
          if (block.is_error) resultStats.is_error++;
          if (block.content) resultStats.has_content++;
          // 检查截断标记
          const text = JSON.stringify(block.content || '');
          if (text.includes('... [truncated]') || text.includes('output truncated')) {
            resultStats.truncated++;
          }
        }
      }
    }
  }
  console.log(`  总数:        ${resultStats.total}`);
  console.log(`  is_error:    ${resultStats.is_error}`);
  console.log(`  有 content:  ${resultStats.has_content}`);
  console.log(`  含截断标记:  ${resultStats.truncated}`);

  // ----- 8. thinking block（扩展思考） -----
  console.log('\n━━━ 8. thinking block（深度思考，可折叠）━━━');
  let thinkingCount = 0;
  let thinkingTotalLen = 0;
  let thinkingSample = null;
  for (const line of lines) {
    const content = line.message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'thinking') {
          thinkingCount++;
          thinkingTotalLen += (block.thinking || '').length;
          if (!thinkingSample) thinkingSample = (block.thinking || '').slice(0, 200);
        }
      }
    }
  }
  if (thinkingCount === 0) {
    console.log('  (无 thinking block)');
  } else {
    console.log(`  数量:    ${thinkingCount}`);
    console.log(`  总长度:  ${thinkingTotalLen} 字符`);
    console.log(`  样本:    ${thinkingSample}...`);
  }

  // ----- 9. 消息树结构（parent-child 关系） -----
  console.log('\n━━━ 9. 消息树结构（parentUuid 关系）━━━');
  const childrenOf = {};
  let orphanCount = 0;
  let rootCount = 0;
  for (const line of lines) {
    if (!line.uuid) continue;
    if (line.parentUuid == null) {
      rootCount++;
    } else {
      if (!childrenOf[line.parentUuid]) childrenOf[line.parentUuid] = [];
      childrenOf[line.parentUuid].push(line.uuid);
      if (!lines.some((l) => l.uuid === line.parentUuid)) {
        orphanCount++; // 父消息不在文件里（被截断？）
      }
    }
  }
  console.log(`  根消息数:     ${rootCount}`);
  console.log(`  孤儿消息数:   ${orphanCount} (parentUuid 指向不存在)`);
  const maxChildren = Object.entries(childrenOf)
    .map(([p, kids]) => ({ p, n: kids.length }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);
  if (maxChildren.length) {
    console.log(`  子节点最多:`);
    maxChildren.forEach((c) => console.log(`      ${c.p} → ${c.n} 个子`));
  }

  // ----- 10. message 模型分布 -----
  console.log('\n━━━ 10. 用过的模型（影响 markdown 渲染、thinking 行为等）━━━');
  const models = {};
  for (const line of lines) {
    const m = line.message?.model;
    if (m) models[m] = (models[m] || 0) + 1;
  }
  if (Object.keys(models).length === 0) {
    console.log('  (无 model 字段)');
  } else {
    for (const [m, c] of Object.entries(models)) {
      console.log(`  ${m.padEnd(40)} ${c}`);
    }
  }

  // ----- 11. 唯一 type:file-history-snapshot 结构 -----
  console.log('\n━━━ 11. file-history-snapshot 字段 ━━━');
  let snapshotSample = null;
  let snapshotCount = 0;
  for (const line of lines) {
    if (line.type === 'file-history-snapshot') {
      snapshotCount++;
      if (!snapshotSample) snapshotSample = line;
    }
  }
  console.log(`  数量: ${snapshotCount}`);
  if (snapshotSample) {
    console.log(`  字段: ${Object.keys(snapshotSample).join(', ')}`);
    if (snapshotSample.snapshot?.trackedFileBackups) {
      const files = Object.keys(snapshotSample.snapshot.trackedFileBackups);
      console.log(`  跟踪的文件 (${files.length} 个):`);
      files.slice(0, 5).forEach((f) => console.log(`      - ${f}`));
      if (files.length > 5) console.log(`      ... 还有 ${files.length - 5} 个`);
    }
  }

  return lines;
}

// ============== 打印单条消息的完整结构 ==============
function printMessageDetail(lines, msgIdx) {
  const line = lines[msgIdx];
  if (!line) {
    console.log(`❌ 索引 ${msgIdx} 超出范围 (总 ${lines.length} 条)`);
    return;
  }

  console.log(`\n${'━'.repeat(70)}`);
  console.log(`📩 第 ${msgIdx} 条消息的完整字段`);
  console.log(`${'━'.repeat(70)}\n`);

  // 递归打印，但限制深度和数组长度
  function dump(obj, indent = 0, maxArrayLen = 3) {
    if (indent > 6) {
      console.log(`${' '.repeat(indent)}... (depth limit)`);
      return;
    }
    const pad = ' '.repeat(indent);

    if (obj === null) { console.log(`${pad}null`); return; }
    if (obj === undefined) { console.log(`${pad}undefined`); return; }
    if (typeof obj !== 'object') {
      const s = String(obj);
      console.log(`${pad}${s.length > 200 ? s.slice(0, 200) + '... [' + s.length + ' chars]' : s}`);
      return;
    }
    if (Array.isArray(obj)) {
      console.log(`${pad}Array(${obj.length})`);
      const slice = obj.slice(0, maxArrayLen);
      slice.forEach((item, i) => {
        console.log(`${pad}  [${i}]`);
        dump(item, indent + 4, maxArrayLen);
      });
      if (obj.length > maxArrayLen) {
        console.log(`${pad}  ... 还有 ${obj.length - maxArrayLen} 个元素未显示`);
      }
      return;
    }
    const keys = Object.keys(obj);
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === 'string' && v.length > 200) {
        console.log(`${pad}${k}: (string, ${v.length} chars) ${v.slice(0, 100)}...`);
      } else if (typeof v === 'object' && v !== null) {
        console.log(`${pad}${k}:`);
        dump(v, indent + 2, maxArrayLen);
      } else {
        console.log(`${pad}${k}: ${JSON.stringify(v)}`);
      }
    }
  }

  dump(line);
}

// ============== 入口 ==============
(async () => {
  const args = process.argv.slice(2);
  const getArg = (n) => {
    const i = args.indexOf(n);
    return i > -1 ? args[i + 1] : null;
  };

  const sessionId = getArg('--session');
  const detailIdx = getArg('--detail');

  let sessionFile;
  if (sessionId) {
    sessionFile = path.join(PROJECT_DIR, `${sessionId}.jsonl`);
  } else {
    // 默认第一个
    const files = (await fs.readdir(PROJECT_DIR)).filter((f) => f.endsWith('.jsonl')).sort();
    if (!files.length) {
      console.log('❌ 没有 session 文件');
      return;
    }
    sessionFile = path.join(PROJECT_DIR, files[0]);
    console.log(`💡 未指定 --session，使用第一个: ${files[0]}`);
  }

  const lines = await analyzeSession(sessionFile);

  if (detailIdx !== null) {
    printMessageDetail(lines, parseInt(detailIdx, 10));
  }
})().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});