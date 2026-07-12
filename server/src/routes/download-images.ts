// POST /download-images
// body: { identifier?: string, urls: string[] }
// 复用 Playwright 单例下载图片，落盘到 os.tmpdir()/chrome-plane-images/<identifier>/，
// 返回每条 URL 对应的本地绝对路径（或失败原因）。
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { getPlaywrightDownloader } from "../playwright-image-downloader.js";

const BodySchema = z.object({
  identifier: z.string().min(1).max(128).optional(),
  urls: z.array(z.string().url()).min(1).max(200),
});

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

function mimeToExt(mime: string): string {
  const key = (mime || "image/png").split(";")[0].trim().toLowerCase();
  return MIME_TO_EXT[key] ?? "png";
}

function safeIdentifier(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 128);
}

export async function registerDownloadImagesRoute(app: FastifyInstance) {
  app.post("/download-images", async (req, reply) => {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "参数不合法",
        details: parsed.error.issues,
      });
    }

    const { urls } = parsed.data;
    const identifier = safeIdentifier(
      parsed.data.identifier ?? `adhoc-${Date.now()}`
    );
    const dir = path.join(os.tmpdir(), "chrome-plane-images", identifier);
    await fs.mkdir(dir, { recursive: true });

    req.log.info(
      { identifier, count: urls.length, dir },
      "download-images request"
    );

    let downloader;
    try {
      downloader = await getPlaywrightDownloader();
    } catch (err: any) {
      req.log.error({ err: err.message }, "playwright init failed");
      return reply
        .code(500)
        .send({ error: `Playwright 初始化失败: ${err.message}` });
    }

    const results = await downloader.downloadImages(urls);

    const files: Array<{
      url: string;
      path: string | null;
      ok: boolean;
      size?: number;
      mimeType?: string;
      error?: string;
    }> = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const result = results[i];
      if (!result) {
        files.push({ url, path: null, ok: false, error: "下载失败（无响应或为空）" });
        continue;
      }
      try {
        const ext = mimeToExt(result.mimeType);
        const fp = path.join(dir, `image-${i + 1}.${ext}`);
        const buf = Buffer.from(result.base64, "base64");
        await fs.writeFile(fp, buf);
        files.push({
          url,
          path: fp,
          ok: true,
          size: buf.length,
          mimeType: result.mimeType,
        });
      } catch (err: any) {
        files.push({ url, path: null, ok: false, error: err.message });
      }
    }

    const okCount = files.filter((f) => f.ok).length;
    req.log.info(
      { identifier, okCount, failCount: files.length - okCount },
      "download-images done"
    );

    return {
      ok: okCount === files.length,
      identifier,
      dir,
      count: files.length,
      successCount: okCount,
      files,
    };
  });
}