# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: login.spec.ts >> 登录流程 >> 访问登录页应该显示登录表单
- Location: login.spec.ts:7:3

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "undefined/accounts/sign-in/", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect, type Page } from "./pages";
  2  | 
  3  | /**
  4  |  * 登录流程 E2E 测试
  5  |  */
  6  | test.describe("登录流程", () => {
  7  |   test("访问登录页应该显示登录表单", async ({ page }) => {
> 8  |     await page.goto(`${process.env.PLAYWRIGHT_PLANE_INSTANCE_URL}/accounts/sign-in/`);
     |                ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  9  |     await page.waitForLoadState("domcontentloaded");
  10 | 
  11 |     // 检查页面标题或 URL
  12 |     await expect(page).toHaveURL(/\/accounts\/sign-in/);
  13 |   });
  14 | 
  15 |   test("登录表单应该包含 email 和 password 输入框", async ({ page }) => {
  16 |     await page.goto(`${process.env.PLAYWRIGHT_PLANE_INSTANCE_URL}/accounts/sign-in/`);
  17 |     await page.waitForLoadState("domcontentloaded");
  18 | 
  19 |     // 检查 email 输入框
  20 |     const emailInput = page.locator('input[type="email"], input[name="email"], input[type="text"]').first();
  21 |     await expect(emailInput).toBeVisible();
  22 | 
  23 |     // 检查 password 输入框
  24 |     const passwordInput = page.locator('input[type="password"]');
  25 |     await expect(passwordInput).toBeVisible();
  26 | 
  27 |     // 检查提交按钮
  28 |     const submitButton = page.locator('button[type="submit"]');
  29 |     await expect(submitButton).toBeVisible();
  30 |   });
  31 | 
  32 |   test("使用正确凭据应该成功登录", async ({ page }) => {
  33 |     const email = process.env.PLAYWRIGHT_PLANE_EMAIL;
  34 |     const password = process.env.PLAYWRIGHT_PLANE_PASSWORD;
  35 | 
  36 |     if (!email || !password) {
  37 |       test.skip("缺少登录凭据");
  38 |     }
  39 | 
  40 |     await page.goto(`${process.env.PLAYWRIGHT_PLANE_INSTANCE_URL}/accounts/sign-in/`);
  41 |     await page.waitForLoadState("domcontentloaded");
  42 | 
  43 |     // 填写登录表单
  44 |     const emailInput = page.locator('input[type="email"], input[name="email"], input[type="text"]').first();
  45 |     const passwordInput = page.locator('input[type="password"]').first();
  46 |     const submitButton = page.locator('button[type="submit"]').first();
  47 | 
  48 |     await emailInput.fill(email);
  49 |     await passwordInput.fill(password);
  50 |     await submitButton.click();
  51 | 
  52 |     // 等待登录完成（跳转到其他页面）
  53 |     await page.waitForURL(/\/accounts\/sign-in/, { timeout: 5000 }).catch(() => {
  54 |       // 如果没有跳转到 sign-in，说明可能登录成功了
  55 |     });
  56 | 
  57 |     // 验证登录成功（不在登录页）
  58 |     const currentUrl = page.url();
  59 |     expect(currentUrl).not.toContain("/accounts/sign-in");
  60 |   });
  61 | });
  62 | 
```