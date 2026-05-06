import { test, expect, type Page, type Browser, type BrowserContext } from "@playwright/test";

/**
 * E2E 测试配置
 */
export const config = {
  baseURL: process.env.PLAYWRIGHT_PLANE_INSTANCE_URL ?? "https://app.plane.so",
  email: process.env.PLAYWRIGHT_PLANE_EMAIL ?? "",
  password: process.env.PLAYWRIGHT_PLANE_PASSWORD ?? "",
  headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
};

/**
 * 登录 Page Object
 */
export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto(`${config.baseURL}/accounts/sign-in/`);
    await this.page.waitForLoadState("domcontentloaded");
  }

  async login(email?: string, password?: string) {
    const emailInput = this.page.locator('input[type="email"], input[name="email"], input[type="text"]').first();
    const passwordInput = this.page.locator('input[type="password"]').first();
    const submitButton = this.page.locator('button[type="submit"]').first();

    await emailInput.fill(email ?? config.email);
    await passwordInput.fill(password ?? config.password);
    await submitButton.click();
  }
}

/**
 * Plane 首页 Page Object
 */
export class PlaneHomePage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto(config.baseURL);
    await this.page.waitForLoadState("domcontentloaded");
  }

  async isLoggedIn(): Promise<boolean> {
    const url = this.page.url();
    return !url.includes("/accounts/sign-in") && !url.includes("/login");
  }
}

/**
 * 共享测试 fixture
 */
export { test, expect };
