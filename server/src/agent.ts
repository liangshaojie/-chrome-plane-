// Claude Agent SDK 调用封装：把 Plane 工作项转成中文 prompt，
// 通过 query() 流式产出分析结果。
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AnalyzableIssue } from "./plane.js";
import { ENABLE_SKILLS, SKILL_TOOL_ROOTS } from "./env.js";

export type AgentEvent =
  | { type: "system"; subtype?: string; model?: string; sessionId?: string; cwd?: string; tools?: string[] }
  | { type: "thinking"; text: string }
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean }
  | { type: "usage"; inputTokens?: number; outputTokens?: number }
  | { type: "done"; subtype: string; durationMs?: number; costUsd?: number; numTurns?: number }
  | { type: "error"; message: string };

// 把 issue 拼成结构化中文 prompt
function buildPrompt(issue: AnalyzableIssue, codeRoot?: string): string {
  const commentsBlock = issue.comments.length
    ? issue.comments
        .map(
          (c, i) =>
            `--- 评论 ${i + 1} by ${c.author} (${c.createdAt ?? ""}) ---\n${c.text}`
        )
        .join("\n\n")
    : "（无评论）";

  const codeHint = codeRoot
    ? `\n\n本地代码仓库路径：${codeRoot}\n你可以使用 Read / Glob / Grep 工具在此仓库内查找相关实现，引用具体文件路径与代码片段。`
    : "\n\n（当前未配置本地代码仓库，仅做静态分析。）";

  const skillHint = ENABLE_SKILLS
    ? `\n\n你可以使用 /skill-name 调用技能来扩展能力，例如 /xiangyu-plane-project:create-task 创建 Plane 子任务。\n可用技能来源：${SKILL_TOOL_ROOTS.join("、")}`
    : "";

  return [
    "你是一位资深前端架构师，请分析下面这条来自 Plane 的工作项。",
    "请先判断它属于【Bug】还是【需求】，再给出分析：",
    "",
    "若为 Bug：",
    "- 可能根因（按可能性排序）",
    "- 复现/验证思路",
    "- 建议优先排查的文件或模块（如果可用本地仓库工具，请用 Grep/Read 给出具体路径）",
    "",
    "若为需求：",
    "- 拆解为可执行的子任务清单",
    "- 影响的模块/页面",
    "- 推荐的技术方案（含数据流、组件划分）",
    "- 风险点与注意事项",
    "",
    "请用 Markdown 输出，结构清晰、要点突出，使用中文。",
    "如果分析过程中需要创建子任务或操作 Plane 项目，可直接使用 /xiangyu-plane-project:create-task 等命令。",
    codeHint,
    skillHint,
    "",
    "================ Plane WorkItem ================",
    `[标识] ${issue.identifier}`,
    `[链接] ${issue.url}`,
    `[标题] ${issue.title}`,
    `[状态] ${issue.state}`,
    `[优先级] ${issue.priority}`,
    `[标签] ${issue.labels.join(", ") || "（无）"}`,
    `[负责人] ${issue.assignees.join(", ") || "（无）"}`,
    "",
    "[描述]",
    issue.description || "（无描述）",
    "",
    "[评论]",
    commentsBlock,
    "================================================",
  ].join("\n");
}

export async function* analyzeIssue(
  issue: AnalyzableIssue,
  signal?: AbortSignal
): AsyncGenerator<AgentEvent> {
  const codeRoot = process.env.LOCAL_CODE_ROOT;
  const prompt = buildPrompt(issue, codeRoot);

  // 基础工具 + 可选的文件操作工具
  const baseTools = ["Skill", "Read", "Glob", "Grep", "Write", "Bash"];
  const fileTools = codeRoot ? ["Read", "Glob", "Grep"] : [];
  const allowedTools = [...baseTools, ...fileTools];

  console.log("\n========== [agent] analyzeIssue start ==========");
  console.log("[agent] ENABLE_SKILLS =", ENABLE_SKILLS);
  console.log("[agent] SKILL_TOOL_ROOTS =", SKILL_TOOL_ROOTS);
  console.log("[agent] env.ANTHROPIC_BASE_URL =", process.env.ANTHROPIC_BASE_URL);
  console.log("[agent] env.ANTHROPIC_MODEL    =", process.env.ANTHROPIC_MODEL);
  console.log("[agent] codeRoot =", codeRoot);
  console.log("[agent] allowedTools =", allowedTools);
  console.log("[agent] prompt length =", prompt.length);

  let msgCount = 0;
  const t0 = Date.now();

  try {
    const model = process.env.ANTHROPIC_MODEL;

    for await (const msg of query({
      prompt,
      options: {
        ...(codeRoot ? { cwd: codeRoot } : {}),
        ...(model ? { model } : {}),
        allowedTools,
        settingSources: ENABLE_SKILLS ? ["user", "project"] : [],
        permissionMode: "acceptEdits",
        maxTurns: 20,
      },
    })) {
      msgCount++;
      const m: any = msg;

      try {
        const brief = {
          n: msgCount,
          dt: Date.now() - t0,
          type: m.type,
          subtype: m.subtype,
          contentBlocks: Array.isArray(m?.message?.content)
            ? m.message.content.map((b: any) => ({
                type: b?.type,
                textLen: typeof b?.text === "string" ? b.text.length : undefined,
                toolName: b?.name,
              }))
            : undefined,
          usage: m?.message?.usage,
        };
        console.log("[agent] raw msg:", JSON.stringify(brief));
      } catch (_e) {
        console.log("[agent] raw msg:", m?.type);
      }

      if (signal?.aborted) {
        console.log("[agent] aborted by client");
        return;
      }

      if (m.type === "system") {
        yield {
          type: "system",
          subtype: m.subtype,
          model: m.model,
          sessionId: m.session_id,
          cwd: m.cwd,
          tools: m.tools,
        };
      } else if (m.type === "assistant" && m.message?.content) {
        for (const block of m.message.content as any[]) {
          if (!block || typeof block !== "object") continue;
          if (block.type === "text" && "text" in block) {
            yield { type: "text", text: String(block.text) };
          } else if (block.type === "thinking" && "thinking" in block) {
            yield { type: "thinking", text: String(block.thinking) };
          } else if (block.type === "tool_use") {
            const toolName = String(block.name ?? "");
            const toolInput = block.input as any;
            if (toolName === "Skill") {
              console.log(`[agent] 🔧 使用技能: ${toolInput?.skill}`);
            }
            yield {
              type: "tool_use",
              id: String(block.id ?? ""),
              name: toolName,
              input: block.input,
            };
          }
        }
        const u = m.message?.usage;
        if (u) {
          yield {
            type: "usage",
            inputTokens: u.input_tokens,
            outputTokens: u.output_tokens,
          };
        }
      } else if (m.type === "user" && m.message?.content) {
        for (const block of m.message.content as any[]) {
          if (!block || typeof block !== "object") continue;
          if (block.type === "tool_result") {
            const raw = block.content;
            let text = "";
            if (typeof raw === "string") text = raw;
            else if (Array.isArray(raw)) {
              text = raw
                .map((p: any) => (p?.type === "text" ? p.text : JSON.stringify(p)))
                .join("\n");
            } else if (raw != null) {
              text = JSON.stringify(raw);
            }
            yield {
              type: "tool_result",
              toolUseId: String(block.tool_use_id ?? ""),
              content: text,
              isError: Boolean(block.is_error),
            };
          }
        }
      } else if (m.type === "result") {
        const subtype = String(m.subtype ?? "ok");
        if (m.is_error || subtype.startsWith("error")) {
          const detail =
            (typeof m.result === "string" && m.result) ||
            m.error?.message ||
            JSON.stringify(m.error ?? m).slice(0, 500);
          yield {
            type: "error",
            message: `SDK 结束于错误：subtype=${subtype}；${detail}`,
          };
        }
        yield {
          type: "done",
          subtype,
          durationMs: m.duration_ms,
          costUsd: m.total_cost_usd,
          numTurns: m.num_turns,
        };
      }
    }
    console.log(`[agent] loop finished: msgs=${msgCount} dt=${Date.now() - t0}ms`);
  } catch (err: any) {
    console.error("[agent] query threw:", err);
    yield { type: "error", message: err?.message ?? String(err) };
  }
  console.log("========== [agent] analyzeIssue end ==========\n");
}
