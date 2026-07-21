// POST /download-images
// body: { identifier?: string, urls: string[] }
// 服务端用 Playwright 单例下载图片（突破 S3 presigned URL 的登录态限制），
// 落到 IMAGE_ROOT/<identifier>/image-N.<ext>，再通过 GET /images/<identifier>/image-N.<ext> 暴露给客户端。
// 返回每条 URL 对应的 accessUrl（http://<host>:<port>/images/<identifier>/image-N.<ext>），
// 客户端可自行 fetch(accessUrl).then(r => r.blob()) 决定存放在 IndexedDB / chrome.storage / 本地磁盘 / 内存预览。
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { promises as fs, createReadStream } from "node:fs";
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

const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

function mimeToExt(mime: string): string {
  const key = (mime || "image/png").split(";")[0].trim().toLowerCase();
  return MIME_TO_EXT[key] ?? "png";
}

function extToMime(ext: string): string {
  return EXT_TO_MIME[ext.toLowerCase()] ?? "application/octet-stream";
}

function safeIdentifier(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 128);
}

// 所有图片集中放在 tmpdir/chrome-plane-images/ 下，
// 通过 /images/* 静态路由对外暴露。
export const IMAGE_ROOT = path.join(os.tmpdir(), "chrome-plane-images");

/**
 * GET /images/<identifier>/<filename>
 * 静态托管下载到本地的图片。要求路径必须落在 IMAGE_ROOT 内，禁止 .. 穿越。
 */
export async function registerImagesStaticRoute(app: FastifyInstance) {
  app.get("/images/*", async (req, reply) => {
    const raw = (req.params as Record<string, string>)["*"];
    // 去掉前导分隔符，normalize 后必须是非空、非 .、不含 ..
    const rel = path.posix.normalize(raw).replace(/^[/\\]+/, "");
    if (!rel || rel === "." || rel.split(/[/\\]/).some((seg) => seg === "..")) {
      return reply.code(400).send({ error: "非法路径" });
    }
    const normRoot = path.resolve(IMAGE_ROOT);
    const abs = path.resolve(normRoot, rel);
    // 二次校验：解析后的绝对路径必须仍在 IMAGE_ROOT 之下
    if (abs !== normRoot && !abs.startsWith(normRoot + path.sep)) {
      return reply.code(400).send({ error: "非法路径" });
    }
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      return reply.code(404).send({ error: "图片不存在" });
    }
    if (!stat.isFile()) {
      return reply.code(404).send({ error: "图片不存在" });
    }
    const ext = path.extname(abs).slice(1);
    reply.header("Content-Type", extToMime(ext));
    reply.header("Content-Length", stat.size);
    reply.header("Cache-Control", "public, max-age=3600");
    return reply.send(createReadStream(abs));
  });
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
    const dir = path.join(IMAGE_ROOT, identifier);
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

    // 拼出对外可访问的 URL 前缀，优先用客户端实际访问的 host（支持多 IP / 域名）
    const hostHeader =
      (req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host;
    const host = hostHeader || req.hostname;
    const proto =
      (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol;
    const baseUrl = `${proto}://${host}/images/${identifier}`;

    const files: Array<{
      url: string;
      accessUrl: string | null;
      filename: string;
      ok: boolean;
      size?: number;
      mimeType?: string;
      error?: string;
    }> = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const result = results[i];
      if (!result) {
        files.push({
          url,
          accessUrl: null,
          filename: `image-${i + 1}.png`,
          ok: false,
          error: "下载失败（无响应或为空）",
        });
        continue;
      }
      try {
        const ext = mimeToExt(result.mimeType);
        const filename = `image-${i + 1}.${ext}`;
        const fp = path.join(dir, filename);
        const buf = Buffer.from(result.base64, "base64");
        await fs.writeFile(fp, buf);
        files.push({
          url,
          accessUrl: `${baseUrl}/${filename}`,
          filename,
          ok: true,
          size: buf.length,
          mimeType: result.mimeType,
        });
      } catch (err: any) {
        files.push({
          url,
          accessUrl: null,
          filename: `image-${i + 1}.png`,
          ok: false,
          error: err.message,
        });
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
      count: files.length,
      successCount: okCount,
      files,
    };
  });
}
