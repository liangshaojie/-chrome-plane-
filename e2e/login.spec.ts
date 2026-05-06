import { test, expect, type Page } from "./pages";

/**
 * 登录流程 E2E 测试
 */
test.describe("登录流程", () => {
  test("访问登录页应该显示登录表单", async ({ page }) => {
    await page.goto(`${process.env.PLAYWRIGHT_PLANE_INSTANCE_URL}/accounts/sign-in/`);
    await page.waitForLoadState("domcontentloaded");

    // 检查页面标题或 URL
    await expect(page).toHaveURL(/\/accounts\/sign-in/);
  });

  test("登录表单应该包含 email 和 password 输入框", async ({ page }) => {
    await page.goto(`${process.env.PLAYWRIGHT_PLANE_INSTANCE_URL}/accounts/sign-in/`);
    await page.waitForLoadState("domcontentloaded");

    // 检查 email 输入框
    const emailInput = page.locator('input[type="email"], input[name="email"], input[type="text"]').first();
    await expect(emailInput).toBeVisible();

    // 检查 password 输入框
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();

    // 检查提交按钮
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
  });

  test("使用正确凭据应该成功登录", async ({ page }) => {
    const email = process.env.PLAYWRIGHT_PLANE_EMAIL;
    const password = process.env.PLAYWRIGHT_PLANE_PASSWORD;

    if (!email || !password) {
      test.skip("缺少登录凭据");
    }

    await page.goto(`${process.env.PLAYWRIGHT_PLANE_INSTANCE_URL}/accounts/sign-in/`);
    await page.waitForLoadState("domcontentloaded");

    // 填写登录表单
    const emailInput = page.locator('input[type="email"], input[name="email"], input[type="text"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();

    await emailInput.fill(email);
    await passwordInput.fill(password);
    await submitButton.click();

    // 等待登录完成（跳转到其他页面）
    await page.waitForURL(/\/accounts\/sign-in/, { timeout: 5000 }).catch(() => {
      // 如果没有跳转到 sign-in，说明可能登录成功了
    });

    // 验证登录成功（不在登录页）
    const currentUrl = page.url();
    expect(currentUrl).not.toContain("/accounts/sign-in");
  });
});
