// POST /issue-detail
// body: { workspaceSlug, issueIdentifier }
// 返回 issue 的 description_html 和图片 asset URL，供前端下载图片
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fetchIssueDetail } from "../plane.js";

const Body = z.object({
  workspaceSlug: z.string().min(1),
  issueIdentifier: z.string().regex(/^[A-Za-z0-9]+-\d+$/),
});

export async function registerIssueDetailRoute(app: FastifyInstance) {
  app.post("/issue-detail", async (req, reply) => {
    const parse = Body.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: "参数错误", detail: parse.error.flatten() });
    }
    const { workspaceSlug, issueIdentifier } = parse.data;

    try {
      const result = await fetchIssueDetail(workspaceSlug, issueIdentifier);
      req.log.info(
        {
          identifier: issueIdentifier,
          htmlLen: result.description_html?.length ?? 0,
          htmlPreview: result.description_html?.slice(0, 300),
          imageAssetUrls: result.imageAssetUrls,
        },
        "issue-detail extracted"
      );
      return { ok: true, ...result };
    } catch (err: any) {
      req.log.error({ err }, "fetchIssueDetail failed");
      return reply.code(500).send({ ok: false, error: err?.message ?? String(err) });
    }
  });
}
