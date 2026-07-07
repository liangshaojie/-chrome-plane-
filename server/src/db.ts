// SQLite 持久化：分析历史记录
// better-sqlite3 同步 API、单文件、零外部服务，适合本地分析服务。
// DB 路径由 DB_PATH 指定，默认 server/data/analyzer.db（data/ 已加入 .gitignore）。
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(process.cwd(), "data", "analyzer.db");
mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    workspace_slug TEXT,
    issue_identifier TEXT,
    issue_title TEXT,
    issue_url TEXT,
    issue_state TEXT,
    role TEXT,
    status TEXT,
    model TEXT,
    duration_ms INTEGER,
    cost_usd REAL,
    num_turns INTEGER,
    output_text TEXT,
    events_json TEXT,
    changed_files_json TEXT,
    review_url TEXT,
    -- 用户在前端 diff 页签对这次改动的最终处置：
    --   committed: 已确认合并并提交（Gerrit review URL 写入 review_url）
    --   reverted : 已取消并恢复（reverted_at 记录恢复时间）
    --   NULL     : 用户尚未处置
    commit_status TEXT,
    reverted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_analyses_issue ON analyses(issue_identifier);
`);

// 兼容已有库：老库没新列，补上（CREATE TABLE 加了 IF NOT EXISTS，老库不会再创建）
function ensureColumn(table: string, column: string, decl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}
ensureColumn("analyses", "commit_status", "TEXT");
ensureColumn("analyses", "reverted_at", "TEXT");

/** 一条分析记录（列名与 DB 一致，snake_case） */
export interface AnalysisRow {
  id?: number;
  created_at: string;
  workspace_slug: string | null;
  issue_identifier: string | null;
  issue_title: string | null;
  issue_url: string | null;
  issue_state: string | null;
  role: string | null;
  status: string;
  model: string | null;
  duration_ms: number | null;
  cost_usd: number | null;
  num_turns: number | null;
  output_text: string | null;
  events_json: string | null;
  changed_files_json: string | null;
  review_url: string | null;
  commit_status: string | null;
  reverted_at: string | null;
}

const insertStmt = db.prepare(`
  INSERT INTO analyses
    (created_at, workspace_slug, issue_identifier, issue_title, issue_url, issue_state,
     role, status, model, duration_ms, cost_usd, num_turns,
     output_text, events_json, changed_files_json, review_url,
     commit_status, reverted_at)
  VALUES
    (@created_at, @workspace_slug, @issue_identifier, @issue_title, @issue_url, @issue_state,
     @role, @status, @model, @duration_ms, @cost_usd, @num_turns,
     @output_text, @events_json, @changed_files_json, @review_url,
     @commit_status, @reverted_at)
`);

/** 插入一条记录，返回自增 id */
export function insertAnalysis(row: AnalysisRow): number {
  return Number(insertStmt.run(row).lastInsertRowid);
}

// 列表查询不含大字段（output_text / events_json / changed_files_json），保持轻量
const listStmt = db.prepare(`
  SELECT id, created_at, workspace_slug, issue_identifier, issue_title, issue_url, issue_state,
         role, status, model, duration_ms, cost_usd, num_turns, review_url,
         commit_status, reverted_at
  FROM analyses
  ORDER BY id DESC
  LIMIT ? OFFSET ?
`);
const countStmt = db.prepare(`SELECT COUNT(*) AS total FROM analyses`);

export function listAnalyses(limit: number, offset: number): { items: Record<string, unknown>[]; total: number } {
  const items = listStmt.all(limit, offset);
  const total = (countStmt.get() as { total: number }).total;
  return { items, total };
}

const getStmt = db.prepare(`SELECT * FROM analyses WHERE id = ?`);
export function getAnalysis(id: number): AnalysisRow | undefined {
  return getStmt.get(id) as AnalysisRow | undefined;
}

const deleteStmt = db.prepare(`DELETE FROM analyses WHERE id = ?`);
export function deleteAnalysis(id: number): boolean {
  return deleteStmt.run(id).changes > 0;
}

/**
 * 把一条记录标记为已确认合并并提交。
 * 仅在该记录存在且未处置过时更新（idempotent + 防止被新的提交覆盖）。
 */
const commitUpdateStmt = db.prepare(`
  UPDATE analyses
     SET commit_status = 'committed',
         review_url = @review_url
   WHERE id = @id
     AND commit_status IS NULL
`);
export function markAnalysisCommitted(id: number, reviewUrl: string | null): boolean {
  return commitUpdateStmt.run({ id, review_url: reviewUrl ?? null }).changes > 0;
}

/**
 * 把一条记录标记为已取消恢复。
 */
const revertUpdateStmt = db.prepare(`
  UPDATE analyses
     SET commit_status = 'reverted',
         reverted_at = @reverted_at
   WHERE id = @id
     AND commit_status IS NULL
`);
export function markAnalysisReverted(id: number): boolean {
  return revertUpdateStmt.run({ id, reverted_at: new Date().toISOString() }).changes > 0;
}