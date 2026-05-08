// 下载评论图片并落盘，供 Claude 通过 MCP/Read 工具分析
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { getPlaywrightDownloader } from "./playwright-image-downloader.js";

/**
 * 下载所有评论图片，返回落盘后的本地绝对路径列表
 */
export async function downloadAndPersistCommentImages(
  identifier: string,
  urls: string[]
): Promise<string[]> {
  if (!urls?.length) return [];

  const downloader = await getPlaywrightDownloader();
  const dir = path.join(os.tmpdir(), "chrome-plane-images", identifier.replace(/[^A-Za-z0-9_-]/g, "_"));
  await fs.mkdir(dir, { recursive: true });

  const results = await downloader.downloadImages(urls);

  const paths: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (!result) continue;
    const ext = (() => {
      const t = (result.mimeType || "image/png").split(";")[0];
      if (t === "image/jpeg" || t === "image/jpg") return "jpg";
      if (t === "image/webp") return "webp";
      if (t === "image/gif") return "gif";
      return "png";
    })();
    const fp = path.join(dir, `comment-img-${i + 1}.${ext}`);
    await fs.writeFile(fp, Buffer.from(result.base64, "base64"));
    paths.push(fp);
  }
  return paths;
}