# chrome-plane 技术文档

chrome-plane：用 Claude Agent SDK 分析 Plane 工作项（Bug / 需求），结果在 Chrome Side Panel 中流式展示。

## 架构总览

```
Chrome 扩展 (Side Panel)  ──HTTP/SSE──►  本地 Node 服务 (Fastify)
                                          ├── Plane REST API（拉 issue / 评论 / 图片）
                                          │     └─ Playwright 代下受保护图片
                                          └── @anthropic-ai/claude-agent-sdk（+ MiniMax MCP）
```

一次「开始分析」的完整链路：

1. 扩展从当前 Tab URL 解析出 `workspaceSlug + issueIdentifier`。
2. `POST /issue-detail` → 后端返回 description_html 与图片 asset URL。
3. 扩展逐张 `GET /proxy-image` 下载图片为 base64（后端 Playwright 保持登录态）。
4. `POST /analyze`（带图片）→ SSE 流，后端拉详情 + 评论 + 评论图片，调 Agent SDK，逐事件回推。
5. 扩展把事件渲染成「过程 / 结果 / 修改方案」三 Tab；可一键把方案写回 Plane 评论/描述。

## 文档

| 文档 | 内容 |
|---|---|
| [server.md](server.md) | 后端：Fastify 路由、Plane API 封装、Claude Agent 封装、Playwright 图片下载、环境变量 |
| [extension.md](extension.md) | 浏览器插件：MV3 清单、Side Panel、SSE 客户端、状态机、写回 Plane、构建调试 |

顶层快速上手见仓库根 [readme.md](../readme.md)。

## 关键约定

- **事件契约**：扩展的 [events.ts](../extension/src/types/events.ts) 必须与后端 [agent.ts](../server/src/agent.ts) + `/analyze` 路由的事件保持一致，改动一端需同步另一端。
- **环境变量加载顺序**：后端 [index.ts](../server/src/index.ts) 第一行必须 `import "./env.js"`，新模块读 env 请包成函数（见 [env.ts](../server/src/env.ts) 注释）。
- **默认地址**：`http://10.10.10.67:8787`（`HOST`/`PORT` 可配）。
