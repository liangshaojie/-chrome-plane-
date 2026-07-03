/**
 * 申请远端 host permission。
 *
 * 设计：
 * - manifest 的 host_permissions 字段只承担本机地址（如 localhost），无需运行时申请。
 * - 其他远端 IP 通过 optional_host_permissions（http 全通配）在运行时由本函数按需弹窗授权。
 * - chrome.permissions.request 必须在用户手势路径上调用（Side Panel 按钮点击），不能在 service worker 任意时刻静默调用。
 *
 * 调用方：useSSE.startAnalysis 在 fetch 之前调用一次。
 *
 * 返回值：
 * - true  —— origin 已/被授权，调用方可继续 fetch
 * - false —— 用户拒绝 / origin 非法 / 浏览器不支持
 */
export async function ensureOriginPermission(origin: string): Promise<boolean> {
  if (!origin) return false

  // 把 serverUrl 转成标准 origin pattern：scheme://host:port/*
  let pattern: string
  try {
    const u = new URL(origin)
    pattern = `${u.protocol}//${u.host}/*`
  } catch {
    return false
  }
  if (!/^https?:/.test(pattern)) return false

  // 某些 dev 环境 / 非扩展上下文里 chrome.permissions 不存在 — 不阻断流程
  const perms = (globalThis as { chrome?: any })?.chrome?.permissions
  if (!perms?.request || !perms?.contains) return true

  // 已授权就直接返回，避免无意义弹窗
  try {
    if (await perms.contains({ origins: [pattern] })) return true
  } catch (e) {
    console.warn('[permissions] contains failed:', e)
  }

  try {
    return await perms.request({ origins: [pattern] })
  } catch (e) {
    console.warn('[permissions] request failed:', e)
    return false
  }
}
