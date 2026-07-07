// 代码改动的“确认提交 / 取消恢复”接口（供前端 diff 审阅后调用）
// - POST /changes/commit   → 确认：在 codeRoot 内 git add/commit/push 到 Gerrit，返回 review 链接
//                              + 给对应 Plane issue 发一条评论（含 review 链接 + AI 标识）
// - POST /changes/revert   → 取消：在 codeRoot 内 git reset --hard HEAD 恢复到改动前
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { runGit } from "./analyze.js";
import { createIssueComment } from "../plane.js";

function codeRootOrThrow(): string {
  const root = process.env.LOCAL_CODE_ROOT;
  if (!root) throw new Error("未配置 LOCAL_CODE_ROOT，无法操作代码仓库");
  return root;
}

// 从 git push 输出里提取 Gerrit review 链接
function extractGerritUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s"'<>]*\/\+\/\d+[^\s"'<>]*/);
  return m ? m[0] : null;
}

const body = z.object({
  workspaceSlug: z.string().min(1),
  issueIdentifier: z.string().min(1),
  title: z.string().optional(),
});

export async function registerChangesRoutes(app: FastifyInstance) {
  // 确认提交：git add → commit → push 到 refs/for/main
  app.post("/changes/commit", async (req, reply) => {
    const parse = body.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ ok: false, error: "参数错误", detail: parse.error.flatten() });
    }
    const { issueIdentifier, title } = parse.data;
    try {
      const root = codeRootOrThrow();

      // 先与远端同步（rebase），避免推送冲突
      try {
        runGit(["fetch", "origin"], root);
        runGit(["rebase", "origin/main"], root);
      } catch (e) {
        req.log.warn({ e }, "fetch/rebase 失败，继续尝试提交");
      }

      runGit(["add", "-A"], root);

      const subject = (title || issueIdentifier).replace(/\s+/g, " ").trim().slice(0, 80);
      const commitMsg = `feat: ${subject}\n\nIssue: #${issueIdentifier}`;
      runGit(["commit", "-m", commitMsg], root);

      // 推送到 Gerrit；runGit 已合并 stdout+stderr，Gerrit 链接在其中
      let pushOut = "";
      try {
        pushOut = runGit(["push", "origin", "HEAD:refs/for/main"], root);
      } catch (e: any) {
        // push 失败时把刚提交的 commit 撤回，保持工作区干净
        try { runGit(["reset", "--soft", "HEAD~1"], root); } catch { /* ignore */ }
        throw new Error(`git push 失败：${(e?.message ?? String(e)).slice(-500)}`);
      }

      const reviewUrl = extractGerritUrl(pushOut);
      req.log.info({ reviewUrl, pushTail: pushOut.slice(-300) }, "gerrit push done");

      // 提交成功后给 Plane issue 发一条评论（含 review 链接 + AI 标识），便于后续统计
      // 评论失败不影响 commit 已成功的事实——返回 commentPosted 让前端提示即可
      let commentPosted = false;
      let commentError: string | null = null;
      try {
        const lines = [
          `🤖 **本次修改由 AI 自动完成**（Plane WorkItem Analyzer）`,
        ];
        if (reviewUrl) lines.push(`🔗 Review: [${reviewUrl}](${reviewUrl})`);
        lines.push(`可按此标记筛选/统计 AI 完成的改动。`);
        const body = lines.join("\n");
        await createIssueComment(parse.data.workspaceSlug, parse.data.issueIdentifier, body);
        commentPosted = true;
        req.log.info({ issueIdentifier: parse.data.issueIdentifier, reviewUrl }, "plane comment posted");
      } catch (e: any) {
        commentError = (e?.message ?? String(e)).slice(-300);
        req.log.warn({ err: e }, "createIssueComment failed (commit itself still succeeded)");
      }

      return { ok: true, reviewUrl: reviewUrl ?? null, commentPosted, commentError };
    } catch (err: any) {
      req.log.error({ err }, "changes/commit failed");
      return reply.code(500).send({ ok: false, error: err?.message ?? String(err) });
    }
  });

  // 取消恢复：回到改动前的 HEAD（Agent 未提交，故 HEAD 即改动前状态）
  app.post("/changes/revert", async (req, reply) => {
    try {
      const root = codeRootOrThrow();
      // reset --hard HEAD 还原所有被跟踪文件的改动；add 过的暂存区也一并清掉
      runGit(["reset", "--hard", "HEAD"], root);
      req.log.info("changes/revert done: reset --hard HEAD");
      return { ok: true };
    } catch (err: any) {
      req.log.error({ err }, "changes/revert failed");
      return reply.code(500).send({ ok: false, error: err?.message ?? String(err) });
    }
  });
}
