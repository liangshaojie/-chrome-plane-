// POST /analyze
// body: { workspaceSlug, issueIdentifier, images? }
// images: [{ url, base64, mimeType }] - 前端下载好的图片 base64
// 返回 SSE 流：data: <json>\n\n
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fetchAnalyzableIssue } from "../plane.js";
import { analyzeIssue } from "../agent.js";
import { downloadAndPersistCommentImages } from "../download-comment-images.js";
import { USER_ROLES, type UserRole } from "../prompts.js";
import { insertAnalysis } from "../db.js";

// 代码改动文件（与前端 ChangedFile 保持一致）
interface ChangedFile {
  path: string;
  additions: number;
  deletions: number;
  diff: string;
}

// 在 codeRoot 仓库里执行 git，合并 stdout + stderr 返回（push 的 Gerrit 链接在 stderr）
export function runGit(args: string[], cwd: string): string {
  const r = spawnSync("git", ["--no-pager", ...args], {
    cwd,
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
    windowsHide: true,
  });
  const combined = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (r.status !== 0) {
    const err = new Error(`git ${args.join(" ")} 失败（exit ${r.status}）：${combined.slice(-500)}`) as Error & {
      stdout?: string;
      stderr?: string;
    };
    err.stdout = r.stdout ?? "";
    err.stderr = r.stderr ?? "";
    throw err;
  }
  return combined;
}

// 把分析开始前的 HEAD 与当前工作区做 diff，按文件拆分
// git diff <sha> 同时覆盖“已提交的新增提交”与“未提交改动”
export function computeChanges(codeRoot: string, startSha: string): ChangedFile[] {
  let full = "";
  try {
    full = runGit(["diff", startSha, "--no-color"], codeRoot);
  } catch {
    return [];
  }
  if (!full.trim()) return [];

  return full
    .split(/^(?=diff --git )/m)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((chunk) => {
      const m = chunk.match(/^diff --git a\/(\S+) b\/(\S+)/);
      const filePath = m ? m[2] : "(未知文件)";
      let additions = 0;
      let deletions = 0;
      for (const line of chunk.split(/\r?\n/)) {
        if (line.startsWith("+++") || line.startsWith("---")) continue;
        if (line.startsWith("+")) additions++;
        else if (line.startsWith("-")) deletions++;
      }
      return { path: filePath, additions, deletions, diff: chunk };
    });
}

// 把前端送来的 base64 图片落盘，返回绝对路径列表
async function persistImages(
  identifier: string,
  images: { url: string; base64: string; mimeType: string }[] | undefined
): Promise<string[]> {
  if (!images?.length) return [];
  const dir = path.join(os.tmpdir(), "chrome-plane-images", identifier.replace(/[^A-Za-z0-9_-]/g, "_"));
  await fs.mkdir(dir, { recursive: true });
  const paths: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (!img?.base64) continue;
    const ext = (() => {
      const t = (img.mimeType || "image/png").split(";")[0];
      if (t === "image/jpeg" || t === "image/jpg") return "jpg";
      if (t === "image/webp") return "webp";
      if (t === "image/gif") return "gif";
      return "png";
    })();
    const fp = path.join(dir, `img-${i + 1}.${ext}`);
    await fs.writeFile(fp, Buffer.from(img.base64, "base64"));
    paths.push(fp);
  }
  return paths;
}

const Body = z.object({
  workspaceSlug: z.string().min(1),
  issueIdentifier: z.string().regex(/^[A-Za-z0-9]+-\d+$/),
  role: z.enum(["developer", "tester", "business"]).optional().default("developer"),
  images: z.array(z.object({
    url: z.string(),
    base64: z.string(),
    mimeType: z.string(),
  })).optional(),
});

/**
 * 把一次分析的事件流落库为一条历史记录，返回自增 id；事件为空则不落库。
 */
function persistAnalysis(
  events: any[],
  meta: { workspaceSlug: string; issueIdentifier: string; role: UserRole }
): number | null {
  if (!events.length) return null;
  const outputText = events
    .filter((e) => e.type === "text")
    .map((e: any) => e.text ?? "")
    .join("");
  const changesEv = events.find((e) => e.type === "changes") as any;
  const doneEv = events.find((e) => e.type === "done") as any;
  const issueEv = events.find((e) => e.type === "issue") as any;
  const sysEv = events.find((e) => e.type === "system") as any;
  const status = doneEv
    ? "done"
    : events.some((e) => e.type === "error")
      ? "error"
      : "aborted";

  return insertAnalysis({
    created_at: new Date().toISOString(),
    workspace_slug: meta.workspaceSlug,
    issue_identifier: issueEv?.issue?.identifier ?? meta.issueIdentifier,
    issue_title: issueEv?.issue?.title ?? null,
    issue_url: issueEv?.issue?.url ?? null,
    issue_state: issueEv?.issue?.state ?? null,
    role: meta.role,
    status,
    model: sysEv?.model ?? null,
    duration_ms: doneEv?.durationMs ?? null,
    cost_usd: doneEv?.costUsd ?? null,
    num_turns: doneEv?.numTurns ?? null,
    output_text: outputText || null,
    events_json: JSON.stringify(events),
    changed_files_json: changesEv ? JSON.stringify(changesEv.files ?? []) : null,
    review_url: null,
  });
}

/**
 * 注册分析路由
 * @param app
 */
export async function registerAnalyzeRoute(app: FastifyInstance) {
  app.post("/analyze", async (req, reply) => {
    const parse = Body.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: "参数错误", detail: parse.error.flatten() });
    }
    const { workspaceSlug, issueIdentifier, role, images } = parse.data;

    // SSE 头
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const ac = new AbortController();
    // 累积本次分析的完整事件流，结束后派生字段落库为历史记录
    const events: any[] = [];

    const send = (event: any): boolean => {
      events.push(event);
      if (reply.raw.destroyed) {
        if (!ac.signal.aborted) ac.abort();
        return false;
      }
      req.log.info({ sse: event.type, preview: JSON.stringify(event).slice(0, 200) }, "SSE →");
      try {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        return true;
      } catch (e) {
        req.log.warn({ e }, "SSE write failed, treating as client disconnect");
        ac.abort();
        return false;
      }
    };

    try {
      req.log.info({ workspaceSlug, issueIdentifier, role, imageCount: images?.length ?? 0 }, "analyze start");

      // 记录分析开始前的 HEAD，用于结束后计算代码改动 diff
      const codeRoot = process.env.LOCAL_CODE_ROOT;
      let startSha: string | null = null;
      if (codeRoot) {
        try {
          startSha = runGit(["rev-parse", "HEAD"], codeRoot).trim() || null;
        } catch (e) {
          req.log.warn({ e }, "记录起始 HEAD 失败，跳过 diff 推送");
        }
      }

      send({ type: "status", message: "正在拉取 Plane workItem..." });
      const issue = await fetchAnalyzableIssue(workspaceSlug, issueIdentifier, images);
      // 把图片落盘，传绝对路径给 agent，让 Claude 用 MCP / Read 工具分析
      const imageFilePaths = await persistImages(issueIdentifier, images);
      const commentImagePaths = await downloadAndPersistCommentImages(issueIdentifier, issue.commentImageUrls ?? []);
      issue.imageFilePaths = [...imageFilePaths, ...commentImagePaths];
      req.log.info(
        {
          identifier: issue.identifier,
          title: issue.title,
          descLen: issue.description.length,
          comments: issue.comments.length,
          imageCount: issue.images?.length ?? 0,
          commentImageCount: issue.commentImageUrls?.length ?? 0,
          imageFilePaths,
          commentImagePaths,
        },
        "issue fetched"
      );
      send({
        type: "issue",
        issue: {
          identifier: issue.identifier,
          title: issue.title,
          state: issue.state,
          labels: issue.labels,
          url: issue.url,
        },
      });
      send({ type: "status", message: "Claude 分析中..." });

      let evCount = 0;
      for await (const ev of analyzeIssue(issue, ac.signal, role)) {
        evCount++;
        send(ev);
        if (ac.signal.aborted) break;
      }
      req.log.info({ evCount, role }, "agent loop done");

      // 分析结束后，把代码改动 diff 推送到前端供人工确认
      // 只对开发者角色推送代码改动 diff（其他角色不会修改代码）
      if (codeRoot && startSha && role === "developer") {
        try {
          const files = computeChanges(codeRoot, startSha);
          req.log.info({ changeCount: files.length }, "computed code changes");
          if (files.length) send({ type: "changes", files });
        } catch (e) {
          req.log.warn({ e }, "compute changes failed");
        }
      } else if (role !== "developer") {
        req.log.info({ role }, "跳过代码改动计算（非开发者角色）");
      }
    } catch (err: any) {
      req.log.error({ err }, "analyze route crashed");
      send({ type: "error", message: err?.message ?? String(err) });
    } finally {
      send({ type: "end" });
      // 从累积的事件流派生全部字段，落库为一条历史记录（落库失败不影响已返回的分析结果）
      try {
        const recordId = persistAnalysis(events, { workspaceSlug, issueIdentifier, role });
        if (recordId != null) send({ type: "saved", id: recordId });
      } catch (e) {
        req.log.warn({ e }, "persist analysis failed");
      }
      reply.raw.end();
    }
  });
}
