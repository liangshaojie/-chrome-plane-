// POST /chat —— 「接着追问」多轮对话接口
// 设计：
// - 强制用 developer 角色（与最初的"代码改动"流程一致，能读写本地代码）
// - 上下文来源：同一 analysis_id 关联的 chat_sessions 里的所有 chat_messages
//   + 当前 issue 简介（拉 Plane 失败也不阻断，只是缺一段上下文）
// - 走 Claude Agent SDK，prompt = 系统提示 + 历史消息（拼成字符串）
// - SSE 流式输出，事件 type: status / text / thinking / tool_use / tool_result / done / error / end / saved / changes
// - 落库：user message 立即 INSERT；assistant 完整回复在 finally 里一次性 INSERT
// - 图片：接收 base64，落盘到 temp，路径拼到 prompt 里告知 agent
// - 结束时：记录对话前的 HEAD，结束后 git diff 算 changes 推给前端
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query, type McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { LOCAL_CODE_ROOT } from "../env.js";
import {
  getOrCreateChatSession,
  listChatMessages,
  appendChatMessage,
  type ChatMessageRow,
} from "../db.js";
import { fetchAnalyzableIssue } from "../plane.js";
import {
  buildSystemPrompt,
  getAllowedToolsForRole,
  type UserRole,
} from "../prompts.js";
import { runGit, computeChanges } from "./analyze.js";

const Body = z.object({
  analysisId: z.number().int().nullable().optional(),
  workspaceSlug: z.string().min(1),
  issueIdentifier: z.string().regex(/^[A-Za-z0-9]+-\d+$/),
  message: z.string().min(1),
  images: z.array(z.object({
    filename: z.string(),
    data: z.string(),  // base64 编码
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  })).optional(),
});

export async function registerChatRoute(app: FastifyInstance) {
  app.post("/chat", async (req, reply) => {
    const parse = Body.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: "参数错误", detail: parse.error.flatten() });
    }
    const { analysisId, workspaceSlug, issueIdentifier, message, images } = parse.data;

    // 1. 取/建会话
    const session = getOrCreateChatSession({
      analysisId: analysisId ?? null,
      workspaceSlug,
      issueIdentifier,
      issueTitle: null,
    });
    if (!session.id) {
      return reply.code(500).send({ error: "会话创建失败" });
    }
    const sessionId = session.id;

    // 2. 先把 user 消息落库（含图片信息）
    const now = new Date().toISOString();
    const imageFilenames = images?.map((img) => img.filename).filter(Boolean) ?? [];
    const contentWithImages = imageFilenames.length
      ? `${message}\n\n[附带图片: ${imageFilenames.join(", ")}]`
      : message;
    appendChatMessage({ session_id: sessionId, role: "user", content: contentWithImages, created_at: now });

    // 3. SSE 头
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const ac = new AbortController();

    const send = (event: any): boolean => {
      if (reply.raw.destroyed) {
        if (!ac.signal.aborted) ac.abort();
        return false;
      }
      try {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        return true;
      } catch {
        ac.abort();
        return false;
      }
    };

    send({ type: "status", message: "准备对话上下文…", sessionId });

    // 4. 拉历史 + 拼 prompt
    const history = listChatMessages(sessionId);
    const userRole: UserRole = "developer";

    let issueCtx = "";
    try {
      const issue = await fetchAnalyzableIssue(workspaceSlug, issueIdentifier, undefined);
      const desc = (issue.description ?? "").slice(0, 1500);
      issueCtx = `\n\n【当前 Plane 工作项】\n标识：${issue.identifier}\n标题：${issue.title}\n状态：${issue.state}\n优先级：${issue.priority}\n负责人：${issue.assignees.join(", ") || "（无）"}\n描述（截取 1500 字）：\n${desc}\n`;
    } catch (e: any) {
      req.log.warn({ e: e?.message }, "chat: fetch issue failed, continue without it");
    }

    // 图片落盘到 temp 目录
    let imagePaths: string[] = [];
    if (images?.length) {
      const imgDir = path.join(os.tmpdir(), "chrome-plane-images", issueIdentifier.replace(/[^A-Za-z0-9_-]/g, "_"), "chat");
      await fs.mkdir(imgDir, { recursive: true });
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (!img?.data) continue;
        const ext = (() => {
          const t = (img.mimeType || "image/png").split(";")[0];
          if (t === "image/jpeg" || t === "image/jpg") return "jpg";
          if (t === "image/webp") return "webp";
          if (t === "image/gif") return "gif";
          return "png";
        })();
        const fp = path.join(imgDir, `${Date.now()}_${i + 1}_${(img.filename || "img").replace(/[^A-Za-z0-9._-]/g, "_")}.${ext}`);
        await fs.writeFile(fp, Buffer.from(img.data, "base64"));
        imagePaths.push(fp);
      }
    }

    const sysPrompt = buildSystemPrompt(userRole, LOCAL_CODE_ROOT ?? undefined);
    const codeHint = LOCAL_CODE_ROOT
      ? `\n本地代码仓库路径：${LOCAL_CODE_ROOT}\n你可以使用 Read / Glob / Grep 工具在此仓库内查找相关实现，也可以用 Write / Bash 修改代码（写完即可结束，用户会接着审阅）。`
      : "\n（当前未配置本地代码仓库，仅做静态问答。）";

    const historyStr = history
      .map((m) => `【${m.role === "user" ? "用户" : "助手"}】\n${m.content}`)
      .join("\n\n---\n\n");

    const imageHint = imagePaths.length
      ? `\n\n【用户附带的图片】\n以下图片已保存到本地，你可以用 Read 工具查看：\n${imagePaths.map((p, i) => `  ${i + 1}. ${p}`).join("\n")}\n请结合图片内容理解用户的问题。`
      : "";

    const fullPrompt = [
      sysPrompt,
      codeHint,
      issueCtx,
      "【历史对话】",
      historyStr || "（暂无历史对话，这是第一轮）",
      imageHint,
      "",
      "请继续按 developer 角色输出。如果涉及修改代码，给出修改方案 + 实际改动的代码 + 改动的文件清单（前端审阅后会决定是否采纳）。",
    ].join("\n");

    req.log.info({ sessionId, analysisId, historyLen: history.length, messageLen: message.length }, "chat start");

    // 5. 记录对话开始前的 HEAD（用于结束后算 diff）
    const codeRoot = LOCAL_CODE_ROOT;
    let startSha: string | null = null;
    if (codeRoot) {
      try {
        startSha = runGit(["rev-parse", "HEAD"], codeRoot).trim() || null;
      } catch (e: any) {
        req.log.warn({ e: e?.message }, "chat: rev-parse HEAD failed, skip diff");
      }
    }
    // 6. 调 Claude Agent SDK（developer 角色：可读写代码 / 跑 bash）
    const model = process.env.ANTHROPIC_MODEL;
    const additionalDirectories: string[] = [];
    if (codeRoot) additionalDirectories.push(codeRoot);
    const extraRoot = "C:\\mo-project\\web-gui";
    if (extraRoot !== codeRoot && !additionalDirectories.includes(extraRoot)) {
      additionalDirectories.push(extraRoot);
    }

    const mcpServers: Record<string, McpServerConfig> = {};
    if (process.env.MINIMAX_API_KEY) {
      mcpServers["minimax-mcp"] = {
        type: "stdio",
        command: "uvx",
        args: ["minimax-coding-plan-mcp", "-y"],
        env: {
          MINIMAX_API_KEY: process.env.MINIMAX_API_KEY,
          MINIMAX_API_HOST: process.env.MINIMAX_API_HOST ?? "https://api.minimaxi.com",
        },
      };
    }

    // 累积 assistant 完整回复（用于落库）
    let assistantReply = "";

    try {
      let evCount = 0;
      for await (const msg of query({
        prompt: fullPrompt,
        options: {
          ...(codeRoot ? { cwd: codeRoot } : {}),
          ...(model ? { model } : {}),
          settingSources: ["user", "project"],
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          maxTurns: 40,
          mcpServers,
          additionalDirectories,
        },
      })) {
        if (signal_aborted(ac.signal)) break;
        const m: any = msg;
        evCount++;
        if (m.type === "assistant" && m.message?.content) {
          for (const block of m.message.content as any[]) {
            if (!block || typeof block !== "object") continue;
            if (block.type === "text" && "text" in block) {
              const t = String(block.text);
              assistantReply += t;
              send({ type: "text", text: t });
            } else if (block.type === "thinking" && "thinking" in block) {
              send({ type: "thinking", text: String(block.thinking) });
            } else if (block.type === "tool_use") {
              send({
                type: "tool_use",
                id: String(block.id ?? ""),
                name: String(block.name ?? ""),
                input: block.input,
              });
            }
          }
        } else if (m.type === "user" && m.message?.content) {
          for (const block of m.message.content as any[]) {
            if (!block || typeof block !== "object") continue;
            if (block.type === "tool_result") {
              const raw = block.content;
              let text = "";
              if (typeof raw === "string") text = raw;
              else if (Array.isArray(raw)) {
                text = raw.map((p: any) => (p?.type === "text" ? p.text : JSON.stringify(p))).join("\n");
              } else if (raw != null) text = JSON.stringify(raw);
              send({
                type: "tool_result",
                toolUseId: String(block.tool_use_id ?? ""),
                content: text,
                isError: Boolean(block.is_error),
              });
            }
          }
        } else if (m.type === "result") {
          const subtype = String(m.subtype ?? "ok");
          send({
            type: "done",
            subtype,
            durationMs: m.duration_ms,
            costUsd: m.total_cost_usd,
            numTurns: m.num_turns,
          });
        }
      }
      req.log.info({ evCount, sessionId }, "chat agent loop done");
    } catch (err: any) {
      req.log.error({ err }, "chat agent crashed");
      send({ type: "error", message: err?.message ?? String(err) });
    } finally {
      // 落库 assistant 回复
      if (assistantReply.trim()) {
        appendChatMessage({
          session_id: sessionId,
          role: "assistant",
          content: assistantReply,
          created_at: new Date().toISOString(),
        });
      }
      // 计算代码改动 diff（developer 角色 + 有 codeRoot + 有 startSha）
      if (codeRoot && startSha) {
        try {
          const files = computeChanges(codeRoot, startSha);
          req.log.info({ changeCount: files.length }, "chat: computed code changes");
          if (files.length) send({ type: "changes", files });
        } catch (e: any) {
          req.log.warn({ e: e?.message }, "chat: compute changes failed");
        }
      }
      send({ type: "end", sessionId });
      reply.raw.end();
    }
  });

  // GET /chat/:sessionId —— 拉历史消息（重新打开 Side Panel 时恢复上下文）
  app.get<{ Params: { sessionId: string } }>("/chat/:sessionId", async (req, reply) => {
    const id = Number(req.params.sessionId);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "无效 sessionId" });
    const msgs = listChatMessages(id);
    return { ok: true, sessionId: id, messages: msgs };
  });
}

// 内部小工具：复用 abort 检查的写法（与 analyze.ts 一致）
function signal_aborted(signal: AbortSignal): boolean {
  return signal?.aborted === true;
}