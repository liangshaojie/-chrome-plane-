// POST /analyze
// body: { workspaceSlug, issueIdentifier, images? }
// images: [{ url, base64, mimeType }] - 前端下载好的图片 base64
// 返回 SSE 流：data: <json>\n\n
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fetchAnalyzableIssue } from "../plane.js";
import { analyzeIssue } from "../agent.js";
import { downloadAndPersistCommentImages } from "../download-comment-images.js";

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
  images: z.array(z.object({
    url: z.string(),
    base64: z.string(),
    mimeType: z.string(),
  })).optional(),
});

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
    const { workspaceSlug, issueIdentifier, images } = parse.data;

    // SSE 头
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
      req.log.info({ workspaceSlug, issueIdentifier, imageCount: images?.length ?? 0 }, "analyze start");
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
      for await (const ev of analyzeIssue(issue, ac.signal)) {
        evCount++;
        send(ev);
        if (ac.signal.aborted) break;
      }
      req.log.info({ evCount }, "agent loop done");
    } catch (err: any) {
      req.log.error({ err }, "analyze route crashed");
      send({ type: "error", message: err?.message ?? String(err) });
    } finally {
      send({ type: "end" });
      reply.raw.end();
    }
  });
}
