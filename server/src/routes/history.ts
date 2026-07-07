// 历史记录接口
//   GET    /history?limit=20&offset=0   列表（摘要，不含大字段）
//   GET    /history/:id                 详情（含 events / output_text / changed_files）
//   DELETE /history/:id                 删除一条
import type { FastifyInstance } from "fastify";
import { listAnalyses, getAnalysis, deleteAnalysis } from "../db.js";

export async function registerHistoryRoutes(app: FastifyInstance) {
  app.get(
    "/history",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
            offset: { type: "integer", default: 0, minimum: 0 },
          },
        },
      },
    },
    async (req) => {
      const { limit, offset } = req.query as { limit: number; offset: number };
      const { items, total } = listAnalyses(limit, offset);
      return { items: items.map(toSummary), total };
    }
  );

  app.get("/history/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "无效 id" });
    const row = getAnalysis(id);
    if (!row) return reply.code(404).send({ error: "记录不存在" });
    return toDetail(row);
  });

  app.delete("/history/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "无效 id" });
    const ok = deleteAnalysis(id);
    if (!ok) return reply.code(404).send({ error: "记录不存在" });
    return { ok: true };
  });
}

// DB row (snake_case) → 列表摘要
function toSummary(r: Record<string, unknown>) {
  return {
    id: r.id,
    created_at: r.created_at,
    workspace_slug: r.workspace_slug,
    issue_identifier: r.issue_identifier,
    issue_title: r.issue_title,
    issue_url: r.issue_url,
    issue_state: r.issue_state,
    role: r.role,
    status: r.status,
    model: r.model,
    duration_ms: r.duration_ms,
    cost_usd: r.cost_usd,
    num_turns: r.num_turns,
    review_url: r.review_url,
  };
}

// DB row → 详情（events_json / changed_files_json 反序列化为数组）
function toDetail(r: Record<string, unknown>) {
  let events: unknown[] = [];
  let changedFiles: unknown[] = [];
  try {
    if (typeof r.events_json === "string") events = JSON.parse(r.events_json);
  } catch { /* ignore */ }
  try {
    if (typeof r.changed_files_json === "string") changedFiles = JSON.parse(r.changed_files_json);
  } catch { /* ignore */ }
  return {
    ...toSummary(r),
    output_text: (r.output_text as string) ?? "",
    events,
    changed_files: changedFiles,
  };
}
