/**
 * 在浏览器里把任意文本保存为本地文件并触发下载。
 *
 * 走 Blob + URL.createObjectURL + 临时 <a download>，不依赖 chrome.downloads，
 * 因此在 Side Panel、Devtools 面板、任意页面都可以调用。
 *
 * - filename 不带扩展名时会自行追加。
 * - 临时创建的 <a> 节点用完即 remove，避免污染 DOM。
 * - URL 对象延迟 1s revoke，给浏览器下载流程留时间。
 */
export function downloadAsFile(
  filename: string,
  content: string,
  mime = 'text/markdown;charset=utf-8'
): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * 生成形如 2026-07-02_153012 的时间戳，文件名安全（Windows / macOS / Linux 都可）。
 */
export function makeTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

/**
 * Issue 元信息子集——只要导出时关心的字段，避免对 stores/analysis 的耦合。
 */
export interface ExportIssueLike {
  identifier?: string
  title?: string
  url?: string
  state?: string
  labels?: string[]
}

/**
 * 拼出 Markdown 导出文件的完整内容：
 *  - 顶部带元信息头（identifier / 标题 / 链接 / 状态 / 标签 / 导出时间）
 *  - 分割线后接正文（已是 markdown）
 *  - 加 UTF-8 BOM —— Windows 记事本打开不乱码
 */
export function buildExportMarkdown(issue: ExportIssueLike | null, body: string): string {
  const id = issue?.identifier ?? 'analysis'
  const title = issue?.title ?? ''

  const meta: string[] = []
  if (issue?.url) meta.push(`- **链接**：${issue.url}`)
  if (issue?.state) meta.push(`- **状态**：${issue.state}`)
  if (issue?.labels?.length) meta.push(`- **标签**：${issue.labels.join(', ')}`)
  meta.push(`- **导出时间**：${new Date().toLocaleString('zh-CN')}`)

  const lines: string[] = [
    `# ${id} · ${title}`,
    '',
    ...meta,
    '',
    '---',
    '',
    body || '（暂无分析正文）',
    '',
  ]

  // UTF-8 BOM，让 Windows 记事本 / Excel 直接打开不乱码
  return '\uFEFF' + lines.join('\n')
}

/**
 * 生成导出文件名：<identifier>_<时间戳>.md
 * 若没有 identifier 则降级到 analysis_<时间戳>.md。
 */
export function makeExportFilename(issue: ExportIssueLike | null, ext = 'md'): string {
  const id = issue?.identifier?.replace(/[\\/:*?"<>|]/g, '_') || 'analysis'
  return `${id}_${makeTimestamp()}.${ext}`
}
