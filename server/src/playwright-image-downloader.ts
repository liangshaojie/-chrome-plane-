// Playwright 自动化下载 Plane 图片
// 通过模拟登录获取 session cookie，突破 S3 presigned URL 的认证限制
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export interface ImageResult {
  url: string;
  base64: string;
  mimeType: string;
}

// 环境变量
const PLANE_EMAIL = process.env.PLAYWRIGHT_PLANE_EMAIL ?? process.env.PLANE_EMAIL;
const PLANE_PASSWORD = process.env.PLAYWRIGHT_PLANE_PASSWORD ?? process.env.PLANE_PASSWORD;
const PLANE_INSTANCE_URL = process.env.PLAYWRIGHT_PLANE_INSTANCE_URL ?? "https://support.max-optics.com";
const HEADLESS = process.env.PLAYWRIGHT_HEADLESS !== "false";

// 单例实例
let instance: PlaywrightImageDownloader | null = null;

export async function getPlaywrightDownloader(): Promise<PlaywrightImageDownloader> {
  if (!instance) {
    instance = new PlaywrightImageDownloader();
    await instance.init();
  }
  return instance;
}

export async function closePlaywrightDownloader(): Promise<void> {
  if (instance) {
    await instance.close();
    instance = null;
  }
}

export class PlaywrightImageDownloader {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private initialized = false;
  private loggedIn = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    if (!PLANE_EMAIL || !PLANE_PASSWORD) {
      throw new Error(`缺少 Playwright 登录凭据`);
    }

    console.log("[playwright] 启动 Chromium (headless=" + !HEADLESS + ")...");
    this.browser = await chromium.launch({
      headless: HEADLESS,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    this.context = await this.browser.newContext();
    this.initialized = true;
    console.log("[playwright] Chromium 启动成功");
  }

  async ensureLoggedIn(): Promise<void> {
    if (!this.context || !this.browser) {
      throw new Error("Playwright 未初始化");
    }

    if (this.loggedIn) {
      console.log("[playwright] 已登录过，跳过");
      return;
    }

    const page = await this.context.newPage();

    try {
      // 访问登录页面
      console.log("[playwright] 访问 Plane 登录页...");
      await page.goto(PLANE_INSTANCE_URL, { timeout: 15000 });
      await page.waitForLoadState("domcontentloaded");
      await new Promise(r => setTimeout(r, 2000));

      console.log(`[playwright] 当前 URL: ${page.url()}`);

      // 第一步：输入邮箱，点击 Continue
      const emailInput = page.getByRole("textbox", { name: "Email" });
      console.log("[playwright] 填写邮箱...");
      await emailInput.fill(PLANE_EMAIL!);

      const continueBtn = page.getByRole("button", { name: "Continue" });
      console.log("[playwright] 点击 Continue...");
      await continueBtn.click();

      // 等待密码输入框出现
      await page.waitForLoadState("domcontentloaded");
      await new Promise(r => setTimeout(r, 2000));

      // 第二步：输入密码，点击 Continue
      const passwordInput = page.getByRole("textbox", { name: "Password" });
      console.log("[playwright] 填写密码...");
      await passwordInput.fill(PLANE_PASSWORD!);

      console.log("[playwright] 点击 Continue...");
      await continueBtn.click();

      // 等待登录完成
      await new Promise(r => setTimeout(r, 5000));

      const finalUrl = page.url();
      console.log(`[playwright] 登录后 URL: ${finalUrl}`);

      this.loggedIn = true;
      console.log("[playwright] 登录成功");
    } catch (err) {
      console.error("[playwright] 登录失败:", err);
      throw err;
    } finally {
      await page.close();
    }
  }

  async downloadImage(url: string): Promise<ImageResult | null> {
    if (!this.context) {
      throw new Error("Playwright 未初始化");
    }

    await this.ensureLoggedIn();

    const page = await this.context.newPage();

    try {
      console.log(`[playwright] 下载图片: ${url}`);

      // 使用 redirect: 'follow' 自动跟随重定向到 S3
      const response = await page.goto(url, {
        timeout: 30000,
        waitUntil: "domcontentloaded",
      });

      if (!response) {
        console.warn("[playwright] 无响应");
        return null;
      }

      console.log(`[playwright] 最终 URL: ${page.url()}`);
      console.log(`[playwright] 响应状态: ${response.status()}`);

      // 获取最终 URL（可能是 S3 的 presigned URL）
      const finalUrl = page.url();

      // 如果最终 URL 不是原始 URL，说明经过了重定向
      if (finalUrl !== url) {
        console.log("[playwright] 经过重定向，获取最终内容");
      }

      const mimeType = response.headers()["content-type"] ?? "image/png";
      const buffer = await response.body();

      if (!buffer || buffer.length === 0) {
        console.warn("[playwright] 无响应体或为空");
        return null;
      }

      const base64 = Buffer.from(buffer).toString("base64");
      console.log(`[playwright] 图片大小: ${buffer.length} bytes`);

      return { url: finalUrl, base64, mimeType };
    } catch (err) {
      console.error("[playwright] downloadImage error:", err);
      return null;
    } finally {
      await page.close();
    }
  }

  async downloadImages(urls: string[]): Promise<ImageResult[]> {
    const results: ImageResult[] = [];
    for (const url of urls) {
      const result = await this.downloadImage(url);
      if (result) results.push(result);
    }
    return results;
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.initialized = false;
    this.loggedIn = false;
    console.log("[playwright] 关闭");
  }
}
