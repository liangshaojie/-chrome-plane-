// Plane API 封装：把 URL 中的 workspace slug + sequence identifier (例如 CSDK-2)
// 解析成 project_id + issue_id，再拉取 issue 详情、状态、标签、评论。
//
// 参考文档：https://docs.plane.so/api-reference

// 每次调用时才读取，避免 ESM 模块加载顺序导致的"空值被固化"问题
const getBase = () => process.env.PLANE_BASE_URL ?? "https://api.plane.so";
const getToken = () => process.env.PLANE_API_TOKEN ?? "";

// 从 PLANE_BASE_URL 提取 API 基础地址
// 例如 https://support.max-optics.com → https://support.max-optics.com
// 例如 https://app.plane.so            → https://api.plane.so
const getApiBase = () => {
  const base = getBase(); // e.g. "https://support.max-optics.com"
  try {
    const u = new URL(base);
    // 自托管 Plane 实例（如 max-optics.com）API 直接在主域名
    // 官方 plane.so 则走 api.plane.so
    if (u.hostname.includes("plane.so")) {
      return `https://api.${u.host}`;
    }
    return base; // 自托管：API 同主域名
  } catch {
    return "https://api.plane.so";
  }
};

// 简易内存缓存：避免每次都去 list projects
const projectCache = new Map<string, PlaneProject[]>(); // workspaceSlug -> projects
const issueIdCache = new Map<string, { projectId: string; issueId: string }>(); // `${slug}/${ident}` -> ids

export interface PlaneProject {
  id: string;
  identifier: string; // 例如 "CSDK"
  name: string;
}

export interface PlaneIssue {
  id: string;
  name: string;
  description_stripped?: string;
  description_html?: string;
  sequence_id: number;
  state?: string;
  state_detail?: { name: string; group: string };
  labels?: string[];
  label_details?: { name: string; color: string }[];
  priority?: string;
  assignee_details?: { display_name: string }[];
  created_at?: string;
  updated_at?: string;
}

export interface PlaneComment {
  id: string;
  comment_stripped?: string;
  comment_html?: string;
  actor_detail?: { display_name: string };
  created_at?: string;
}

// 从 HTML 中提取图片 URL，返回完整的 presigned asset URL
function extractImageAssetUrlsFromHtml(html: string, workspaceSlug: string, projectId: string): string[] {
  return extractImageAssetUrls(html, workspaceSlug, projectId);
}

export interface AnalyzableIssue {
  workspaceSlug: string;
  identifier: string; // 例如 "CSDK-2"
  url: string;
  title: string;
  description: string;
  state: string;
  priority: string;
  labels: string[];
  assignees: string[];
  comments: { author: string; text: string; createdAt?: string }[];
  images?: { url: string; base64: string; mimeType: string }[];
  /** 来自评论的图片 URL（待下载） */
  commentImageUrls?: string[];
  // 图片落盘后的本地绝对路径，供 Claude 通过 MCP / Read 工具使用
  imageFilePaths?: string[];
}

function assertToken() {
  if (!getToken()) {
    throw new Error("缺少 PLANE_API_TOKEN，请在 server/.env 中配置");
  }
}

async function planeFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  assertToken();
  const method = init?.method ?? "GET";
  const res = await fetch(`${getBase()}${path}`, {
    method,
    headers: {
      "X-API-Key": getToken(),
      "Content-Type": "application/json",
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Plane API ${method} ${res.status} ${res.statusText}: ${path}\n${body}`
    );
  }
  // 某些 PATCH/POST 可能返回空
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as unknown as T;
  }
}

// 列出工作区所有项目，结果带缓存
async function listProjects(workspaceSlug: string): Promise<PlaneProject[]> {
  const cached = projectCache.get(workspaceSlug);
  if (cached) return cached;
  const data = await planeFetch<PlaneProject[] | { results: PlaneProject[] }>(
    `/api/v1/workspaces/${workspaceSlug}/projects/`
  );
  const list = Array.isArray(data) ? data : data.results;
  projectCache.set(workspaceSlug, list);
  return list;
}

// 通过项目 identifier 找到 project_id
async function findProjectByIdentifier(workspaceSlug: string, projectIdent: string) {
  const projects = await listProjects(workspaceSlug);
  const match = projects.find(
    (p) => p.identifier.toLowerCase() === projectIdent.toLowerCase()
  );
  if (!match) {
    throw new Error(
      `未在 workspace ${workspaceSlug} 中找到 identifier=${projectIdent} 的项目`
    );
  }
  return match;
}

// 通过 sequence_id 找到 issue_id（Plane 一些版本支持 ?sequence_id=xx 过滤）
async function findIssueIdBySequence(
  workspaceSlug: string,
  projectId: string,
  sequenceId: number
): Promise<string> {
  // 先尝试带过滤的 list
  try {
    const data = await planeFetch<PlaneIssue[] | { results: PlaneIssue[] }>(
      `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/issues/?sequence_id=${sequenceId}`
    );
    const list = Array.isArray(data) ? data : data.results;
    const hit = list.find((i) => i.sequence_id === sequenceId);
    if (hit) return hit.id;
  } catch {
    // 忽略，走兜底
  }
  // 兜底：分页拉取（仅用于小项目；如需大项目需要分页 while）
  const data = await planeFetch<PlaneIssue[] | { results: PlaneIssue[] }>(
    `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/issues/`
  );
  const list = Array.isArray(data) ? data : data.results;
  const hit = list.find((i) => i.sequence_id === sequenceId);
  if (!hit) {
    throw new Error(`未找到 sequence_id=${sequenceId} 的 issue`);
  }
  return hit.id;
}

// 解析 "CSDK-2" -> { projectId, issueId }，带缓存
export async function resolveIssueIds(
  workspaceSlug: string,
  identifier: string
): Promise<{ projectId: string; issueId: string; project: PlaneProject; sequenceId: number }> {
  const m = identifier.match(/^([A-Za-z0-9]+)-(\d+)$/);
  if (!m) {
    throw new Error(`非法 identifier: ${identifier}（期望形如 CSDK-2）`);
  }
  const projectIdent = m[1];
  const sequenceId = Number(m[2]);

  const cacheKey = `${workspaceSlug}/${identifier.toUpperCase()}`;
  const cached = issueIdCache.get(cacheKey);
  const project = await findProjectByIdentifier(workspaceSlug, projectIdent);
  if (cached) {
    return { ...cached, project, sequenceId };
  }

  const issueId = await findIssueIdBySequence(workspaceSlug, project.id, sequenceId);
  const ids = { projectId: project.id, issueId };
  issueIdCache.set(cacheKey, ids);
  return { ...ids, project, sequenceId };
}

export async function getIssueDetail(
  workspaceSlug: string,
  projectId: string,
  issueId: string
): Promise<PlaneIssue> {
  return planeFetch<PlaneIssue>(
    `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/`
  );
}

export async function listIssueComments(
  workspaceSlug: string,
  projectId: string,
  issueId: string
): Promise<PlaneComment[]> {
  try {
    const data = await planeFetch<PlaneComment[] | { results: PlaneComment[] }>(
      `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/comments/`
    );
    return Array.isArray(data) ? data : data.results;
  } catch {
    return [];
  }
}

// 从 description_html 中提取所有图片的 asset URL
// 支持的几种 Plane 富文本图片标记：
//   1) <img src="https://..."> 直接 URL
//   2) <image-component src="<assetId>"> 仅 assetId（需拼接 asset URL）
//   3) <image src="<assetId 或 URL>"> 自定义元素的另一种命名
//   4) 任意标签里出现 src="<assetId>"，且 assetId 是 UUID 形式
export function extractImageAssetUrls(html: string, workspaceSlug: string, projectId: string): string[] {
  const urls = new Set<string>();
  const assetBase = `${getApiBase()}/api/assets/v2/workspaces/${workspaceSlug}/projects/${projectId}`;
  const uuidRe = /^[0-9a-fA-F-]{32,40}$/; // 粗略 uuid 判定

  const pushSrc = (raw: string) => {
    if (!raw) return;
    // 已经是绝对 URL：原样使用
    if (/^https?:\/\//i.test(raw)) {
      urls.add(raw);
      return;
    }
    // 形如 UUID 的 assetId：拼成 Plane asset URL
    if (uuidRe.test(raw.trim())) {
      urls.add(`${assetBase}/${raw.trim()}/?disposition=inline`);
      return;
    }
    // 退化处理：以 / 开头的相对路径，拼到 API 基础地址
    if (raw.startsWith("/")) {
      urls.add(`${getApiBase()}${raw}`);
      return;
    }
  };

  // 通用：抓取所有 <xxx ... src="..."> 标签的 src
  // 仅在标签名形如 img / image / image-component / picture 等才认为是图片
  const tagRe = /<\s*(img|image|image-component|picture)\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    pushSrc(m[2]);
  }

  return Array.from(urls);
}

// 返回 issue 详情（含 description_html 和图片 asset URL），供前端下载图片
export async function fetchIssueDetail(
  workspaceSlug: string,
  identifier: string
): Promise<{ description_html: string; imageAssetUrls: string[] }> {
  const { projectId, issueId } = await resolveIssueIds(workspaceSlug, identifier);
  const issue = await getIssueDetail(workspaceSlug, projectId, issueId);
  const imageAssetUrls = issue.description_html
    ? extractImageAssetUrls(issue.description_html, workspaceSlug, projectId)
    : [];
  return {
    description_html: issue.description_html ?? "",
    imageAssetUrls,
  };
}

// 把以上三步聚合，输出便于喂给 Claude 的结构
// images 由调用方从 description_html 解析后传入（前端有浏览器 Cookie 可下载）
export async function fetchAnalyzableIssue(
  workspaceSlug: string,
  identifier: string,
  images?: { url: string; base64: string; mimeType: string }[]
): Promise<AnalyzableIssue> {
  const { projectId, issueId, project, sequenceId } = await resolveIssueIds(
    workspaceSlug,
    identifier
  );
  const [issue, comments] = await Promise.all([
    getIssueDetail(workspaceSlug, projectId, issueId),
    listIssueComments(workspaceSlug, projectId, issueId),
  ]);

  return {
    workspaceSlug,
    identifier: `${project.identifier}-${sequenceId}`,
    url: `https://support.max-optics.com/${workspaceSlug}/browse/${project.identifier}-${sequenceId}/`,
    title: issue.name,
    description: issue.description_stripped ?? "",
    state: issue.state_detail?.name ?? issue.state ?? "",
    priority: issue.priority ?? "",
    labels: (issue.label_details ?? []).map((l) => l.name),
    assignees: (issue.assignee_details ?? []).map((a) => a.display_name),
    comments: comments.map((c) => ({
      author: c.actor_detail?.display_name ?? "unknown",
      text: c.comment_stripped ?? "",
      createdAt: c.created_at,
    })),
    images: images?.length ? images : undefined,
    // 收集评论中的图片 URL
    commentImageUrls: comments.flatMap((c) =>
      c.comment_html ? extractImageAssetUrlsFromHtml(c.comment_html, workspaceSlug, projectId) : []
    ),
  };
}

// 把 Markdown 简单转 HTML：Plane 的 description_html / comment_html 接受 HTML。
// 这里只做最小实现：把换行转 <br>、代码块/列表保持原文包在 <pre>/<p> 里。
function markdownToHtml(md: string): string {
  // 非常简化：按段落切分；段落内换行转 <br>；已有 HTML 标记则原样保留
  const escaped = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const blocks = escaped.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((b) => `<p>${b.replace(/\n/g, "<br/>")}</p>`).join("\n");
}

// 更新 issue 描述（支持 markdown / html）
export async function updateIssueDescription(
  workspaceSlug: string,
  identifier: string,
  markdown: string
): Promise<void> {
  const { projectId, issueId } = await resolveIssueIds(workspaceSlug, identifier);
  await planeFetch(
    `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/`,
    {
      method: "PATCH",
      body: {
        description_html: markdownToHtml(markdown),
        description_stripped: markdown,
      },
    }
  );
}

// 新增一条评论
export async function createIssueComment(
  workspaceSlug: string,
  identifier: string,
  markdown: string
): Promise<void> {
  const { projectId, issueId } = await resolveIssueIds(workspaceSlug, identifier);
  await planeFetch(
    `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/comments/`,
    {
      method: "POST",
      body: {
        comment_html: markdownToHtml(markdown),
        comment_stripped: markdown,
      },
    }
  );
}
