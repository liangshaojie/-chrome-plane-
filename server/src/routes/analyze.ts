// POST /analyze
// body: { workspaceSlug, issueIdentifier }
// 返回 SSE 流：data: <json>\n\n
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fetchAnalyzableIssue } from "../plane.js";
import { analyzeIssue } from "../agent.js";

const Body = z.object({
  workspaceSlug: z.string().min(1),
  issueIdentifier: z.string().regex(/^[A-Za-z0-9]+-\d+$/),
});

export async function registerAnalyzeRoute(app: FastifyInstance) {
  app.post("/analyze", async (req, reply) => {
    const parse = Body.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: "参数错误", detail: parse.error.flatten() });
    }
    const { workspaceSlug, issueIdentifier } = parse.data;

    // SSE 头
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // 注意：不使用 req.raw.on('close') 来判断"客户端已断开"——这个事件在
    // Node 某些版本的 HTTP keep-alive 连接上会在请求体读完时就误触发，导致
    // 我们以为客户端断开而提前 return，SDK 的后续消息就被丢弃。
    // 改为：尝试写 SSE 时如果 reply.raw 已 destroyed 就判定断开。
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
      req.log.info({ workspaceSlug, issueIdentifier }, "analyze start");
      send({ type: "status", message: "正在拉取 Plane workItem..." });
      const issue = await fetchAnalyzableIssue(workspaceSlug, issueIdentifier);
      req.log.info(
        {
          identifier: issue.identifier,
          title: issue.title,
          descLen: issue.description.length,
          comments: issue.comments.length,
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
