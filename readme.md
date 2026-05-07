# chrome-plane · Plane WorkItem Analyzer

用 Claude Agent SDK 分析 Plane 的工作项（Bug / 需求），结果在 Chrome Side Panel 中流式展示。

## 架构

```
Chrome 扩展 (Side Panel)  ──HTTP/SSE──►  本地 Node 服务 (Fastify)
                                          ├── Plane REST API（拉取 issue/comments）
                                          └── @anthropic-ai/claude-agent-sdk（分析）
```

## 目录

- `extension/` Chrome 扩展（MV3 + Side Panel）
- `server/` 本地 Node 后端（Fastify + Claude Agent SDK）

## 启动

### 1. 启动后端

```bash
cd server
cp .env.example .env   # 填写 PLANE_API_TOKEN / ANTHROPIC_API_KEY
pnpm install           # 或 npm install
pnpm dev               # http://10.10.10.62:8787
```

可选：在 `.env` 中设置 `LOCAL_CODE_ROOT=/path/to/your-repo`，
让 Claude 可在该目录内使用 `Read/Glob/Grep` 工具结合本地代码做分析。

### 2. 加载扩展

1. Chrome 打开 `chrome://extensions/`，开启「开发者模式」
2. 点击「加载已解压的扩展程序」，选择本仓库的 `extension/` 目录
3. 打开任意 Plane workItem，例如 `https://support.max-optics.com/lsj/browse/CSDK-2/`
4. 点击工具栏的扩展图标 → 弹出右侧 Side Panel
5. 点击「开始分析」即可看到流式分析结果

## 要求

- Chrome 114+（Side Panel API）
- Node.js 18+
- Plane API Token、Anthropic API Key
