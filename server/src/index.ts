// Fastify 启动入口
// ⚠️ 必须最先 import ./env —— ESM 里 import 会在任何语句之前执行，
// 若在这里用 dotenv.config() 语句，反而会晚于下面几个 import 的模块顶层代码。
import "./env.js";

import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerAnalyzeRoute } from "./routes/analyze.js";

const app = Fastify({ logger: { level: "info" } });

// 允许 chrome-extension://* 与本地调试
await app.register(cors, {
  origin: true, // 反射请求 Origin
  methods: ["GET", "POST", "OPTIONS"],
});

app.get("/health", async () => ({
  ok: true,
  hasPlaneToken: Boolean(process.env.PLANE_API_TOKEN),
  hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
  hasAnthropicAuthToken: Boolean(process.env.ANTHROPIC_AUTH_TOKEN),
  anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL ?? null,
  anthropicModel: process.env.ANTHROPIC_MODEL ?? null,
  localCodeRoot: process.env.LOCAL_CODE_ROOT ?? null,
}));

await registerAnalyzeRoute(app);

const port = Number(process.env.PORT ?? 8787);
app
  .listen({ host: "127.0.0.1", port })
  .then(() => {
    app.log.info(`chrome-plane server listening on http://127.0.0.1:${port}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
