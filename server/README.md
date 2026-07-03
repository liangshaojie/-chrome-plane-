# chrome-plane server

本地 Node 后端：拉取 Plane workItem，使用 `@anthropic-ai/claude-agent-sdk` 进行分析，并以 SSE 流式推送给 Chrome 扩展。

## 启动

```bash
cd server
cp .env.example .env  # 填写 PLANE_API_TOKEN / ANTHROPIC_API_KEY 等
pnpm install          # 或 npm install / yarn
pnpm dev              # tsx watch src/index.ts
```

默认监听 `http://10.10.10.67:8787`。

## 接口

- `GET /health` 健康检查 + 配置回显
- `POST /analyze` SSE 流，body: `{ workspaceSlug: string, issueIdentifier: "CSDK-2" }`

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `PLANE_API_TOKEN` | Plane 个人 API Token |
| `PLANE_BASE_URL` | Plane API 基址，默认 `https://api.plane.so` |
| `ANTHROPIC_API_KEY` | Anthropic API Key |
| `LOCAL_CODE_ROOT` | 可选；配置后允许 Claude 用 Read/Glob/Grep 在该目录内分析 |
| `PORT` | 监听端口，默认 8787 |
