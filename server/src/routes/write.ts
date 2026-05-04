// 把分析结果写回 Plane 的接口：
// - POST /plane/description   → 覆盖 issue 描述（适合写完整详细版）
// - POST /plane/comment       → 追加一条评论（建议短摘要）
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import {
  createIssueComment,
  updateIssueDescription,
} from "../plane.js";

const body = z.object({
  workspaceSlug: z.string().min(1),
  issueIdentifier: z.string().min(1),
  content: z.string().min(1),
});

export async function registerWriteRoutes(app: FastifyInstance) {
  app.post("/plane/description", async (req, reply) => {
    const parse = body.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: "参数错误", detail: parse.error.flatten() });
    }
    const { workspaceSlug, issueIdentifier, content } = parse.data;
    try {
      await updateIssueDescription(workspaceSlug, issueIdentifier, content);
      return { ok: true };
    } catch (err: any) {
      req.log.error({ err }, "updateIssueDescription failed");
      return reply.code(500).send({ ok: false, error: err?.message ?? String(err) });
    }
  });

  app.post("/plane/comment", async (req, reply) => {
    const parse = body.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: "参数错误", detail: parse.error.flatten() });
    }
    const { workspaceSlug, issueIdentifier, content } = parse.data;
    try {
      await createIssueComment(workspaceSlug, issueIdentifier, content);
      return { ok: true };
    } catch (err: any) {
      req.log.error({ err }, "createIssueComment failed");
      return reply.code(500).send({ ok: false, error: err?.message ?? String(err) });
    }
  });
}
