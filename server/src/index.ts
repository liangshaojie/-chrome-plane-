// Fastify 启动入口
// ⚠️ 必须最先 import ./env —— ESM 里 import 会在任何语句之前执行，
// 若在这里用 dotenv.config() 语句，反而会晚于下面几个 import 的模块顶层代码。
import "./env.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { execSync } from "child_process";
import { registerAnalyzeRoute } from "./routes/analyze.js";
import { registerChangesRoutes } from "./routes/changes.js";
import { registerIssueDetailRoute } from "./routes/issue-detail.js";
import { registerProxyImageRoute } from "./routes/proxy-image.js";
import { registerHistoryRoutes } from "./routes/history.js";
import { registerChatRoute } from "./routes/chat.js";

// Fix: Windows 终端中文乱码，设置代码页为 UTF-8
if (process.platform === "win32") {
  try { execSync("chcp 65001", { stdio: "pipe" }); } catch { /* ignore */ }
}

const app = Fastify({ logger: { level: "info" } });

// 允许 chrome-extension://* 与本地调试
await app.register(cors, {
  origin: true, // 反射请求 Origin
  methods: ["GET", "POST", "OPTIONS"],
});

/**
 * 健康检查接口
 */
app.get("/health", async () => ({
  ok: true,
  env: process.env.NODE_ENV ?? "development",
  host: process.env.HOST ?? "0.0.0.0",
  hasPlaneToken: Boolean(process.env.PLANE_API_TOKEN),
  hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
  hasAnthropicAuthToken: Boolean(process.env.ANTHROPIC_AUTH_TOKEN),
  anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL ?? null,
  anthropicModel: process.env.ANTHROPIC_MODEL ?? null,
  localCodeRoot: process.env.LOCAL_CODE_ROOT ?? null,
}));

/**
 * 注册路由
 */
await registerAnalyzeRoute(app);
await registerChangesRoutes(app);
await registerIssueDetailRoute(app);
await registerProxyImageRoute(app);
await registerHistoryRoutes(app);
await registerChatRoute(app);

/**
 * 启动服务器
 */
// 默认绑 0.0.0.0，适配多个开发机不同 IP 的场景；调用方则用 localhost/<本机 IP>/<远程 IP> 连接都可以。
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";
app
  .listen({ host, port })
  .then(() => {
    app.log.info(`chrome-plane server listening on http://${host}:${port}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
