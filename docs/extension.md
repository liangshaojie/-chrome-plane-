# 浏览器插件技术文档 · Plane WorkItem Analyzer

Chrome MV3 扩展（含 Side Panel）：从当前 Plane 工作项页面解析 issue 标识，调用本地后端 `/analyze` 获取 SSE 流，把 Claude 的分析过程（思考 / 工具调用 / 结果 / 最终回答）实时渲染，并支持把结果写回 Plane。

- 技术栈：Vue 3 + Pinia + TypeScript + Vite + `@crxjs/vite-plugin`
- 要求：Chrome 114+（Side Panel API）
- 后端依赖：[chrome-plane server](server.md)

---

## 1. 目录结构

```
extension/
├── manifest.json             # MV3 清单：权限 / 背景 / content script / side panel
├── background.js             # Service Worker：点图标打开 Side Panel
├── content-script.js         # 注入 Plane 页面（目前用于 DOM 内下载图片，可选）
├── sidepanel.html            # Side Panel 入口 HTML
├── vite.config.ts            # crx 插件 + Vue，alias @ -> /src
├── package.json
└── src/
    ├── main.ts               # Vue 应用挂载入口
    ├── App.vue               # 顶层布局 + 写回逻辑（adoptProposal）
    ├── types/
    │   └── events.ts         # AgentEvent / IssueInfo / Step 类型（与 server 对齐）
    ├── stores/
    │   ├── settings.ts       # serverUrl（持久化到 chrome.storage.local）
    │   └── analysis.ts       # 分析状态机核心：handleEvent() 把 SSE 事件转成 Step
    ├── composables/
    │   ├── useChromeTabs.ts  # 监听当前激活 Tab URL
    │   ├── usePlaneUrl.ts    # 从 URL 解析 workspaceSlug + issueIdentifier
    │   └── useSSE.ts         # 三步请求流程 + SSE 流读取
    └── components/
        ├── TopBar.vue        │  ProcessLog.vue   # 过程分析（步骤树）
        ├── Controls.vue      │  OutputPane.vue   # 分析结果（Markdown）
        ├── IssueCard.vue     │  ProposalPane.vue # 修改方案提取 + 采纳
        ├── StatusBar.vue     │  TabNav.vue       # 三 Tab 切换
        ├── StepCard.vue      │
        └── ...
```

构建产物输出到 `dist/`，在 Chrome「加载已解压扩展」时直接选 `extension/`（dev）或 `dist/`（构建后）。

---

## 2. Manifest 关键配置  · [manifest.json](extension/manifest.json)

- **权限**：`sidePanel`、`activeTab`、`tabs`、`storage`、`cookies`
- **host_permissions**：`*.plane.so`、`*.max-optics.com`、本机 `http://localhost:8787`
- **optional_host_permissions**：`http://*/*` —— 当 server 跑在远端开发机（IP 不固定）时，前端 `useSSE.startAnalysis` 会调用 `chrome.permissions.request` 弹窗让用户授权该 origin，授权后持久化
- **background**：`background.js`（Service Worker）
- **content_scripts**：注入 `*.plane.so` / `*.max-optics.com`（`document_idle`）
- **side_panel**：`default_path: sidepanel.html`
- **action**：仅设 `default_title`，靠 [background.js](extension/background.js) 的 `setPanelBehavior({ openPanelOnActionClick: true })` 实现「点图标即开 Side Panel」。

---

## 3. 核心数据流

```
用户点「开始分析」
   │  Controls.vue -> useSSE.startAnalysis(parsed, serverUrl)
   ▼
useSSE.ts 三步流程：
   1) POST /issue-detail          → 拿 description_html + imageAssetUrls
   2) GET  /proxy-image (逐张)    → 下载图片为 base64（Playwright 代下）
   3) POST /analyze (带 images)    → SSE 流
        │  按 "\n\n" 分帧，解析 "data:" 行 JSON
        ▼
   analysisStore.handleEvent(ev)  → 转成 Step[]，驱动 UI
```

### 3.1 URL 解析  · [usePlaneUrl.ts](extension/src/composables/usePlaneUrl.ts)
[useChromeTabs.ts](extension/src/composables/useChromeTabs.ts) 监听 `tabs.onActivated` / `onUpdated` 维护 `currentTabUrl`；`parsePlaneUrl()` 要求 hostname 以 `plane.so` / `max-optics.com` 结尾，路径形如 `/<workspace>/browse/<IDENT-123>`，identifier 大写后返回。

### 3.2 SSE 客户端  · [useSSE.ts](extension/src/composables/useSSE.ts)
- 用原生 `fetch` + `ReadableStream` 读流（不用 `EventSource`，因为需要 POST）。
- 分帧：累加 buffer，按 `\n\n` 切块，块内取 `data:` 行 JSON.parse。
- 图片下载走 [downloadImagesViaProxy()](extension/src/composables/useSSE.ts#L13)：逐张 `GET {serverUrl}/proxy-image?url=`，30s 超时，更新进度状态。
- `AbortController` 贯穿三步，「停止」按钮 `abort()` 后端会感知到断开并停 Agent。

### 3.3 状态机  · [analysis.ts](extension/src/stores/analysis.ts)
`phase: 'idle' | 'analyzing' | 'done' | 'error'`。

`handleEvent(ev)` 是核心 reducer，把 `AgentEvent` 转成 `Step`：
- `status` → 状态条 + 一个 sys 步骤
- `issue` → 存 `issue` ref + 一个 Plane 卡片步骤
- `system` → SDK 初始化步骤（session/cwd/tools）
- `thinking` → 思考步骤（title 截断 120 字，body 全文）
- `text` → 累加到 `outputText`（最终结果），并一个「回答」步骤
- `tool_use` → 工具步骤（`stepByToolId` 记 id→index，便于回填结果）
- `tool_result` → 命中已有工具步骤则把结果**追加**进 body 并更新 title（`工具 → 结果预览`），否则单独建「工具结果」步骤
- `error` → 错误步骤
- `done` → 组装 `subtype / turns / 耗时 / 费用`，把 `outputText` 拷给 `writebackText`，置 `phase='done'`

> `usage`（token）case 已移除，不再渲染「TOKEN 输入/输出」步骤。

---

## 4. 写回 Plane  · [App.vue](extension/src/App.vue)

「修改方案」Tab（[ProposalPane.vue](extension/src/components/ProposalPane.vue)）从 `outputText` 用正则提取 `## 修复方案 / 技术方案 / 子任务 / 修改方案 / 实施步骤 / 推荐方案 / 根因 / 解决思路` 等 H2 段落为卡片。

点「采纳此方案」→ `adoptProposal()`：
```ts
POST {serverUrl}/plane/comment
body: { workspaceSlug, issueIdentifier, content }
// content = 【AI 修改方案 - 已采纳】+ 方案标题/正文 + 落款
```
状态通过 `writebackStatus` / `writebackStatusKind` 反馈到顶/底状态条。也可走 `/plane/description` 覆盖描述（`postWriteback()` 已封装通用入口）。

---

## 5. 设置持久化  · [settings.ts](extension/src/stores/settings.ts)

`serverUrl` 默认空字符串，由 Controls.vue 的 placeholder `http://<server-ip>:8787` 提示用户填写，填入后存 `chrome.storage.local`。[Controls.vue](extension/src/components/Controls.vue) `watch(serverUrl)` 自动保存。

首次「开始分析」时，`useSSE.startAnalysis` 会调用 [`ensureOriginPermission()`](extension/src/utils/permissions.ts) —— 命中本地 `localhost` 不弹窗，命中远端 origin 会触发 Chrome 原生授权弹窗，授权后持久化。

---

## 6. 构建 / 调试

```bash
cd extension
pnpm install
pnpm dev       # vite + crx，热重载（开发时加载 extension/ 目录）
pnpm build     # vue-tsc 类型检查 + vite build -> dist/
```

加载步骤：
1. `chrome://extensions/` → 开启「开发者模式」
2. 「加载已解压的扩展程序」→ 选 `extension/`（或 `dist/`）
3. 打开任意 Plane workItem，如 `https://support.max-optics.com/<ws>/browse/CSDK-2/`
4. 点工具栏图标 → Side Panel → 填后端地址 → 「开始分析」

---

## 7. 事件类型契约  · [types/events.ts](extension/src/types/events.ts)

`AgentEvent` 必须与 [server/src/agent.ts](../server/src/agent.ts) 的 `AgentEvent` + `/analyze` 路由发出的 `status`/`issue`/`end` 事件**保持一致**。两端不同步会导致 SSE 解析/渲染异常。改动 server 事件时记得同步本文件。

`EventKind`（步骤样式分类）：`sys | tool | think | text | result | usage | done | err`，对应 [StepCard.vue](extension/src/components/StepCard.vue) 的配色表。

---

## 8. 已知约定 / 注意事项

- `content-script.js` 的 DOM 内下载（带 cookie 的 fetch）目前**未在主流程使用**——图片改走服务端 `/proxy-image`（Playwright 代下，更可靠）。保留 content script 作为可选回退。
- 已支持任意 HTTP 后端 origin：靠 `optional_host_permissions` + `chrome.permissions.request` 弹窗授权，写死 IP 的老 manifest 条目已清理。
- `useSSE` 未对 serverUrl 做协议/格式校验，仅去尾斜杠。
- Markdown 渲染依赖 `marked`（[package.json](extension/package.json#L13)），见 OutputPane 渲染 `outputText`。
