// GET /proxy-image?url=<encoded_image_url>
// 使用 Playwright 自动化登录 Plane 并下载图片
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

    req.log.info({ url: decodedUrl.slice(0, 80) }, "proxy-image request");

    try {
      const downloader = await getPlaywrightDownloader();
      const result = await downloader.downloadImage(decodedUrl);

      if (result) {
        req.log.info({ size: result.base64.length }, "image downloaded");
        return { ok: true, base64: result.base64, mimeType: result.mimeType };
      }

      return reply.code(502).send({ error: "图片下载失败" });
    } catch (err: any) {
      req.log.error({ err: err.message }, "proxy-image failed");
      return reply.code(502).send({ error: `图片下载异常: ${err.message}` });
    }
  });
}
