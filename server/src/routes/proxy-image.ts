// GET /proxy-image?url=<encoded_image_url>
// 代理下载 Plane 图片（带上 X-API-Key 认证），返回 base64
import type { FastifyInstance } from "fastify";

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

    const token = process.env.PLANE_API_TOKEN;
    if (!token) {
      return reply.code(500).send({ error: "服务端未配置 PLANE_API_TOKEN" });
    }

    try {
      const res = await fetch(decodedUrl, {
        headers: {
          "X-API-Key": token,
        },
      });

      if (!res.ok) {
        return reply.code(502).send({ error: `图片下载失败 ${res.status}` });
      }

      const buf = await res.arrayBuffer();
      const mimeType = res.headers.get("content-type") ?? "image/png";
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));

      return { ok: true, base64, mimeType };
    } catch (err: any) {
      return reply.code(502).send({ error: `图片下载异常: ${err.message}` });
    }
  });
}
