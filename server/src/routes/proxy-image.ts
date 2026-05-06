// GET /proxy-image?url=<encoded_image_url>
// 代理下载 Plane 图片：优先用 Bearer Token 访问 asset API（会 302 → S3 presigned URL）
// 若返回 401，则用 redirect: 'manual' 拿到 Location（S3 presigned URL）直接下载（无需认证）
// 最后回退到 Playwright 自动化模拟登录下载
import type { FastifyInstance } from "fastify";
import { getPlaywrightDownloader } from "../playwright-image-downloader.js";

export async function registerProxyImageRoute(app: FastifyInstance) {
  app.get("/proxy-image", {
    schema: {
      querystring: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    }
  }, async (req, reply) => {
    const { url: rawUrl } = req.query as { url: string };
    if (!rawUrl) {
      return reply.code(400).send({ error: "缺少 url 参数" });
    }

    let decodedUrl: string;
    try {
      decodedUrl = decodeURIComponent(rawUrl);
    } catch {
      return reply.code(400).send({ error: "无效的 url 编码" });
    }

    // 策略：先用 Bearer token 尝试；若是 401，则跟随 redirect 到 S3 presigned URL（无需认证）
    const browserToken = (req.headers['x-plane-token'] as string | undefined)
    const token = browserToken ?? process.env.PLANE_API_TOKEN
    req.log.info({ browserToken: browserToken ? '(provided)' : '(missing)', hasEnvToken: !!process.env.PLANE_API_TOKEN }, 'proxy-image auth attempt')

    try {
      // Step 1: 用 Bearer token 尝试访问 asset API（期望 302 redirect 到 S3 presigned URL）
      if (token) {
        const authHeader: Record<string, string> = { "Authorization": `Bearer ${token}` }
        const res = await fetch(decodedUrl, { headers: authHeader, redirect: 'follow' })

        if (res.ok) {
          // 下载成功（S3 presigned URL 无需认证，可能直接返回内容）
          const buf = await res.arrayBuffer()
          const mimeType = res.headers.get("content-type") ?? "image/png"
          const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
          req.log.info({ status: res.status, source: 'direct' }, 'image fetched')
          return { ok: true, base64, mimeType }
        }

        // 401: asset API 拒绝了（需要 session cookie），尝试 redirect: manual
        if (res.status === 401 || res.status === 302) {
          req.log.info({ status: res.status }, 'asset API auth failed, trying redirect capture')
        }
      }

      // Step 2: 用 redirect: 'manual' 捕获 302 Location（S3 presigned URL）
      const fallbackHeaders: Record<string, string> = token
        ? { "Authorization": `Bearer ${token}` }
        : {}
      const redirectRes = await fetch(decodedUrl, {
        headers: fallbackHeaders,
        redirect: 'manual',
      })

      if (redirectRes.status === 302 || redirectRes.status === 301) {
        const location = redirectRes.headers.get('location')
        req.log.info({ location: location?.slice(0, 80) + '...' }, 'captured redirect location')
        if (location) {
          // S3 presigned URL 无需 Authorization header
          const s3Res = await fetch(location)
          if (s3Res.ok) {
            const buf = await s3Res.arrayBuffer()
            const mimeType = s3Res.headers.get("content-type") ?? "image/png"
            const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
            req.log.info({ source: 's3-presigned' }, 'image fetched via S3 redirect')
            return { ok: true, base64, mimeType }
          }
          return reply.code(502).send({ error: `S3 下载失败 ${s3Res.status}`, url: location })
        }
      }

      // Step 3: 回退到 Playwright 自动化下载
      req.log.info('Trying Playwright fallback...')
      try {
        const downloader = await getPlaywrightDownloader()
        const result = await downloader.downloadImage(decodedUrl)
        if (result) {
          req.log.info({ source: 'playwright' }, 'image fetched via Playwright')
          return { ok: true, base64: result.base64, mimeType: result.mimeType }
        }
      } catch (playwrightErr: any) {
        req.log.error({ err: playwrightErr }, 'Playwright fallback failed')
      }

      return reply.code(502).send({
        error: `图片获取失败（status: ${redirectRes.status}）`,
        detail: redirectRes.headers.get('location') ?? undefined,
      })
    } catch (err: any) {
      return reply.code(502).send({ error: `图片下载异常: ${err.message}` });
    }
  });
}
