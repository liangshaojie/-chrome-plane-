// Claude Agent SDK 调用封装：把 Plane 工作项转成中文 prompt，
// 通过 query() 流式产出分析结果。
import { query, type McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
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

  // 图片处理策略：服务端已把图片落盘到本地绝对路径，这里把路径列出给 Claude，
  // 由 Claude 主动调用已配置的 MCP 图像理解工具（例如 minimax 的 image understanding MCP）来分析。
  // 不再走多模态 content block —— 我们用的网关（如 MiniMax-Anthropic 兼容协议）不一定支持 vision。
  const imagePaths = issue.imageFilePaths ?? [];
  const imageHint =
    imagePaths.length > 0
      ? [
          "",
          `【工作项描述中的图片】共 ${imagePaths.length} 张，已下载到本地，绝对路径如下：`,
          ...imagePaths.map((p, i) => `  ${i + 1}. ${p}`),
          "",
          "⚠️ 重要：请**优先调用已配置的 MCP 图像理解工具**（例如 minimax 提供的 image understanding / understand_image 等 MCP 工具）来分析这些图片，",
          "把图片中的关键信息（界面截图、报错堆栈、流程图、设计稿等）作为分析依据。",
          "如果没有可用的 MCP 图像工具，再退化为通过 Read 工具读取这些文件元信息。",
          "请在最终分析里明确说明你识别到的图片内容。",
        ].join("\n")
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
    imageHint,
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
  console.log("[agent] ========== prompt full text ==========\n", prompt, "\n==========================================");

  let msgCount = 0;
  const t0 = Date.now();

  try {
    const model = process.env.ANTHROPIC_MODEL;

    // 让 Claude Code 自由调用所有 user/project 设置中的 MCP 工具（包含 minimax 图像理解 MCP）
    // 因此这里不再硬限制 allowedTools，并把 permissionMode 设为 bypassPermissions 以避免 MCP 工具被权限弹窗拦截。
    // 注入 MiniMax MCP，使 Agent 能调用图像理解等工具
    const mcpServers: Record<string, McpServerConfig> = {
      "minimax-mcp": {
        type: "stdio",
        command: "uvx",
        args: ["minimax-coding-plan-mcp", "-y"],
        env: {
          MINIMAX_API_KEY: process.env.MINIMAX_API_KEY ?? "",
          MINIMAX_API_HOST: process.env.MINIMAX_API_HOST ?? "https://api.minimaxi.com",
        },
      },
    };

    for await (const msg of query({
      prompt,
      options: {
        ...(codeRoot ? { cwd: codeRoot } : {}),
        ...(model ? { model } : {}),
        settingSources: ["user", "project"],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        maxTurns: 20,
        mcpServers,
      },
    })) {
      msgCount++;
      const m: any = msg;

      // 打印完整消息详情（含 tool_use / tool_result 的 input 和 content）
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
                toolInput: b?.input,
              }))
            : undefined,
          usage: m?.message?.usage,
        };
        console.log("[agent] raw msg:", JSON.stringify(brief, null, 2));
      } catch (_e) {
        console.log("[agent] raw msg:", JSON.stringify(m, null, 2));
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
            console.log(`[agent] tool_result for ${block.tool_use_id}:`, text.slice(0, 300));
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
