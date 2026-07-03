# Server 技术文档 · chrome-plane 后端

本地 Node 后端：拉取 Plane 工作项、用 `@anthropic-ai/claude-agent-sdk` 分析，并通过 SSE 流式把分析过程推送给 Chrome 扩展。同时提供「下载评论图片」「写回 Plane（描述 / 评论）」等辅助接口。

- 技术栈：Node.js 18+ / TypeScript / Fastify 4 / Zod / Playwright / Claude Agent SDK
- 默认监听：`0.0.0.0:8787`（接受所有网卡的连接；本机、局域网、跨机都能访问），`HOST` / `PORT` 可配（`HOST=0.0.0.0` 为默认值）。
- 模块系统：ESM（`"type": "module"`），构建产物走 `.js` + 显式 `.js` 后缀 import

---

## 1. 目录结构

```
server/
├── .env / .env.example        # 环境变量配置
├── package.json               # scripts: dev / start / build
├── tsconfig.json
└── src/
    ├── index.ts               # Fastify 启动入口（注册路由 + CORS + 监听）
    ├── env.ts                 # 必须最先 import，注入 .env 到 process.env
    ├── plane.ts               # Plane REST API 封装（解析 ID、拉详情/评论、写回）
    ├── agent.ts               # Claude Agent SDK 封装：buildPrompt + analyzeIssue 流
    ├── routes/
    │   ├── analyze.ts         # POST /analyze —— SSE 分析流（核心）
    │   ├── issue-detail.ts    # POST /issue-detail —— 取 description_html + 图片 URL
    │   ├── write.ts           # POST /plane/description、/plane/comment —— 写回 Plane
    │   └── proxy-image.ts     # GET /proxy-image —— Playwright 代下图片
    ├── download-comment-images.ts   # 下载评论图片并落盘
    └── playwright-image-downloader.ts # Playwright 登录态下载器（单例）
```

---

## 2. 模块加载顺序（重要坑点）

[index.ts:4](server/src/index.ts#L4) **第一行就 `import "./env.js"`**。

原因见 [env.ts](server/src/env.ts)：ESM 中所有 `import` 在任何语句之前执行。若在 `index.ts` 里写成 `dotenv.config()` 语句，会晚于 `plane.ts` / `agent.ts` 等模块顶层读取环境变量的代码，导致 `process.env` 为空被固化。

`plane.ts` 为了规避同一问题，所有环境变量读取都包成函数（如 `getBase()` / `getToken()`），每次调用时现读，而不是在模块顶层缓存。新增模块请沿用此约定。

---

## 3. HTTP 接口

入口 [index.ts](server/src/index.ts) 注册了 4 组路由 + 1 个健康检查。CORS 反射 Origin，允许 `chrome-extension://*` 与本地调试。

### 3.1 `GET /health`
健康检查 + 配置回显（只回显 token 是否存在，不泄露明文）：
```json
{
  "ok": true,
  "hasPlaneToken": true,
  "hasAnthropicKey": true,
  "hasAnthropicAuthToken": true,
  "anthropicBaseUrl": "...",
  "anthropicModel": "...",
  "localCodeRoot": "..."
}
```

### 3.2 `POST /issue-detail`  · [routes/issue-detail.ts](server/src/routes/issue-detail.ts)
**Body**：`{ workspaceSlug, issueIdentifier }`（identifier 形如 `CSDK-2`）
**返回**：`{ ok, description_html, imageAssetUrls: string[] }`

用于让前端先拿到 description_html，正则提取其中的图片 asset URL，再走代理下载。`imageAssetUrls` 由 [plane.ts](server/src/plane.ts) 的 `extractImageAssetUrls()` 解析。

### 3.3 `POST /analyze`  · [routes/analyze.ts](server/src/routes/analyze.ts)（核心）
**Body**：
```ts
{
  workspaceSlug: string,
  issueIdentifier: string,           // /^[A-Za-z0-9]+-\d+$/
  images?: { url, base64, mimeType }[]  // 前端已下载好的描述图片
}
```
**响应**：`text/event-stream`，每条 `data: <json>\n\n`。处理流程：

1. `reply.raw.writeHead(200, SSE 头)`，建立 `AbortController`。
2. `send()` 统一出口：写流前判断 `reply.raw.destroyed`，写失败即 `ac.abort()`（把客户端断开转换成 abort 信号，传给 Agent SDK）。
3. `status: "正在拉取 Plane workItem..."` → `fetchAnalyzableIssue()`。
4. 把描述图片（前端传入的 base64）落盘到 `os.tmpdir()/chrome-plane-images/<identifier>/img-N.<ext>` → `persistImages()`。
5. 下载评论图片并落盘 → `downloadAndPersistCommentImages()`，合并进 `issue.imageFilePaths`。
6. `issue` 事件（identifier/title/state/labels/url）→ `status: "Claude 分析中..."`。
7. `for await (const ev of analyzeIssue(issue, ac.signal)) send(ev)`，逐条转发。
8. `finally`：发 `end` 事件 + `reply.raw.end()`。

> 落盘后给 Claude 的是**本地绝对路径**而非 base64，让 Agent 主动调用 MCP 图像理解工具分析。

### 3.4 `POST /plane/description` · `POST /plane/comment`  · [routes/write.ts](server/src/routes/write.ts)
**Body**：`{ workspaceSlug, issueIdentifier, content }`
分别调 `updateIssueDescription()` / `createIssueComment()`，把分析结果写回 Plane。Markdown 会被 [plane.ts](server/src/plane.ts) 的 `markdownToHtml()` 做最小转换（转义 + 段落包 `<p>` + 换行转 `<br/>`）。

### 3.5 `GET /proxy-image?url=<encoded>`  · [routes/proxy-image.ts](server/src/routes/proxy-image.ts)
用 Playwright 单例下载图片（突破 Plane 的登录态/签名限制），返回 `{ ok, base64, mimeType }`。失败返回 502。

---

## 4. Plane API 封装  · [plane.ts](server/src/plane.ts)

### 4.1 identifier 解析链路
`"CSDK-2"` → `resolveIssueIds()`：

1. 正则切出 projectIdent(`CSDK`) + sequenceId(`2`)。
2. `findProjectByIdentifier()` → `listProjects()` 列出工作区所有项目（**带内存缓存** `projectCache`），匹配 identifier。
3. `findIssueIdBySequence()`：先试 `?sequence_id=N` 过滤查询，失败兜底全量 list 后 `find`。
4. 结果 `{ projectId, issueId }` 存入 `issueIdCache`。

### 4.2 API 基址自适应  · `getApiBase()`
- 官方 `plane.so` → `https://api.<host>`
- 自托管（如 `max-optics.com`）→ API 同主域名

所有请求带 `X-API-Key: <PLANE_API_TOKEN>` 头。

### 4.3 图片 URL 提取  · `extractImageAssetUrls()`
从 HTML 里抓图片，兼容多种 Plane 富文本标记：
- `<img src="https://...">` 绝对 URL → 原样
- `<image-component src="<uuid>">` 仅 assetId → 拼成 `${apiBase}/api/assets/v2/workspaces/<ws>/projects/<proj>/<uuid>/?disposition=inline`
- `/` 开头相对路径 → 拼 API 基址

### 4.4 聚合输出  · `fetchAnalyzableIssue()`
并发拉 `getIssueDetail` + `listIssueComments`，组装成 `AnalyzableIssue`（含标题/描述/状态/优先级/标签/负责人/评论/评论图片 URL）。`url` 当前硬编码为 `https://support.max-optics.com/...`，自托管它处时需改。

---

## 5. Claude Agent 封装  · [agent.ts](server/src/agent.ts)

### 5.1 prompt 构造  · `buildPrompt()`
把 `AnalyzableIssue` 拼成结构化中文 prompt：
- 角色设定：「资深前端架构师」
- 先判 Bug / 需求，再分别给不同分析框架（Bug：根因/复现/排查点；需求：子任务/影响模块/技术方案/风险）
- 注入 `codeRoot` 提示（若配置 `LOCAL_CODE_ROOT`，告知可用 Read/Glob/Grep）
- 注入技能提示（`ENABLE_SKILLS=true` 时，告知可 `/skill-name` 调用）
- 注入图片路径提示：**优先调用 MCP 图像理解工具**分析落盘图片，无则退化 Read

### 5.2 query() 调用
- `settingSources: ["user","project"]` —— 继承用户的 Claude Code MCP / 设置
- `permissionMode: "bypassPermissions"` + `allowDangerouslySkipPermissions: true` —— 避免 MCP 工具被权限弹窗拦截
- `maxTurns: 20`
- **注入 MiniMax MCP**（`uvx minimax-coding-plan-mcp`），让 Agent 能调用图像理解等工具
- `additionalDirectories`：`codeRoot` + 硬编码的 `C:\mo-project\web-gui`
- `allowedTools` 定义了但实际未硬限制（注释说明让 Claude 自由调用所有工具）

### 5.3 事件流转换
`query()` 产出的原始消息（`system`/`assistant`/`user`/`result`）被转成统一的 `AgentEvent`：

| 原始 | 转出 AgentEvent |
|---|---|
| `system` | `{type:"system", subtype, model, sessionId, cwd, tools}` |
| `assistant.content[text]` | `{type:"text", text}` |
| `assistant.content[thinking]` | `{type:"thinking", text}` |
| `assistant.content[tool_use]` | `{type:"tool_use", id, name, input}` |
| `user.content[tool_result]` | `{type:"tool_result", toolUseId, content, isError}` |
| `result` | `{type:"done", subtype, durationMs, costUsd, numTurns}` 或 `error` |

> `usage`（token 输入/输出）事件已**移除**——不再 yield，前端也不再渲染。

`signal.aborted` 时立即 `return`，支持客户端「停止」。

---

## 6. 图片下载  · [playwright-image-downloader.ts](server/src/playwright-image-downloader.ts)

Playwright 单例（`getPlaywrightDownloader()`），用 headless Chromium 模拟登录 Plane 获取 session cookie，从而下载被签名/登录保护的 S3 presigned 图片。

登录流程（`ensureLoggedIn()`，只执行一次）：
1. 访问实例首页 → 填邮箱 → 点 Continue
2. 等密码框 → 填密码 → 点 Continue
3. 等待跳转完成，标记 `loggedIn=true`

下载（`downloadImage()`）：`page.goto(url, redirect:'follow')` 跟随重定向到 S3 → 取 `response.body()` 转 base64。

凭据来自 `PLAYWRIGHT_PLANE_EMAIL` / `PLAYWRIGHT_PLANE_PASSWORD`。评论图片批量下载见 [download-comment-images.ts](server/src/download-comment-images.ts)。

---

## 7. 环境变量

| 变量 | 说明 | 默认 |
|---|---|---|
| `PLANE_API_TOKEN` | Plane 个人 API Token（必填） | — |
| `PLANE_BASE_URL` | Plane API 基址 | `https://api.plane.so` |
| `LOCAL_CODE_ROOT` | 本地代码仓库，配置后 Agent 可用 Read/Glob/Grep 分析 | — |
| `ENABLE_SKILLS` | `true` 时在 prompt 注入技能提示 | `false` |
| `SKILL_TOOL_ROOTS` | 技能根目录，逗号分隔 | `~/.claude/skills` |
| `PLAYWRIGHT_PLANE_EMAIL` / `PLAYWRIGHT_PLANE_PASSWORD` | Playwright 登录凭据 | — |
| `PLAYWRIGHT_PLANE_INSTANCE_URL` | Plane 实例地址 | `https://support.max-optics.com` |
| `PLAYWRIGHT_HEADLESS` | `false` 时非 headless | `true` |
| `ANTHROPIC_*` / `MINIMAX_*` | Claude SDK / MiniMax MCP 凭据与模型 | — |
| `HOST` / `PORT` | 监听地址 | `0.0.0.0` / `8787`（HOST 为 `undefined`/`空` 时默认绑全网卡，任意 IP 都可连） |

---

## 8. 开发与运行

```bash
cd server
cp .env.example .env          # 填写 token / 凭据
pnpm install                  # 或 npm install
pnpm dev                      # tsx watch src/index.ts（热重载）
pnpm build && pnpm start      # 编译后运行
```

Windows 下 [index.ts:14-16](server/src/index.ts#L14) 会 `chcp 65001` 解决中文乱码。

---

## 9. 已知约定 / 注意事项

- `os.tmpdir()/chrome-plane-images/` 会累积下载的图片，需自行清理。
- `allowedTools` 与 `additionalDirectories` 中有硬编码 `C:\mo-project\web-gui`，跨环境部署需调整。
- `fetchAnalyzableIssue()` 里 issue `url` 硬编码 `support.max-optics.com`。
- Agent SDK 日志（`[agent] raw msg:` 等）目前直接 `console.log`，量较大，生产环境可降级。
