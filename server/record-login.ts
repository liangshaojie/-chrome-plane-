// Playwright 录制脚本：录制 Plane 登录流程
// 运行方式: npx playwright test record-login.spec.ts --headed
// 或者直接运行: npx tsx record-login.ts

import { chromium, type Page, type Browser } from "playwright";

const PLANE_EMAIL = process.env.PLAYWRIGHT_PLANE_EMAIL ?? "your@email.com";
const PLANE_PASSWORD = process.env.PLAYWRIGHT_PLANE_PASSWORD ?? "yourpassword";
const PLANE_URL = process.env.PLAYWRIGHT_PLANE_INSTANCE_URL ?? "https://app.plane.so";

async function recordLogin() {
  const browser: Browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page: Page = await context.newPage();

  try {
    console.log("=== 开始录制登录流程 ===\n");

    // 1. 访问登录页
    console.log("1. 访问登录页...");
    await page.goto(`${PLANE_URL}/accounts/sign-in/`);
    await page.waitForLoadState("domcontentloaded");
    await new Promise(r => setTimeout(r, 2000));
    console.log(`   当前URL: ${page.url()}\n`);

    // 2. 打印页面结构
    console.log("2. 页面HTML结构:");
    const html = await page.content();
    // 简化输出，只显示body中的前几个元素
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      console.log("   " + bodyMatch[1].slice(0, 2000).replace(/\n/g, "\n   "));
    }
    console.log("");

    // 3. 查找输入框
    console.log("3. 查找输入框...");
    const inputs = await page.locator("input").all();
    console.log(`   找到 ${inputs.length} 个 input 元素`);
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const tagName = await input.evaluate(el => el.tagName);
      const type = await input.evaluate(el => el.getAttribute("type") ?? "text");
      const name = await input.evaluate(el => el.getAttribute("name") ?? "");
      const id = await input.evaluate(el => el.getAttribute("id") ?? "");
      const placeholder = await input.evaluate(el => el.getAttribute("placeholder") ?? "");
      const visible = await input.isVisible().catch(() => false);
      console.log(`   [${i}] tag=${tagName}, type=${type}, name=${name}, id=${id}, placeholder=${placeholder}, visible=${visible}`);
    }
    console.log("");

    // 4. 查找按钮
    console.log("4. 查找按钮...");
    const buttons = await page.locator("button").all();
    console.log(`   找到 ${buttons.length} 个 button 元素`);
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const type = await btn.evaluate(el => el.getAttribute("type") ?? "button");
      const text = await btn.textContent();
      const visible = await btn.isVisible().catch(() => false);
      console.log(`   [${i}] type=${type}, text="${text?.trim()}", visible=${visible}`);
    }
    console.log("");

    // 5. 填写登录表单
    console.log("5. 填写登录表单...");
    const emailInput = page.locator('input[type="email"], input[name="email"], input[type="text"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();

    const emailVisible = await emailInput.isVisible().catch(() => false);
    console.log(`   email输入框可见: ${emailVisible}`);
    const passwordVisible = await passwordInput.isVisible().catch(() => false);
    console.log(`   password输入框可见: ${passwordVisible}`);
    const submitVisible = await submitButton.isVisible().catch(() => false);
    console.log(`   submit按钮可见: ${submitVisible}`);

    if (emailVisible && passwordVisible) {
      await emailInput.fill(PLANE_EMAIL);
      console.log(`   已填写邮箱: ${PLANE_EMAIL}`);
      await passwordInput.fill(PLANE_PASSWORD);
      console.log(`   已填写密码: ${"*".repeat(PLANE_PASSWORD.length)}`);
    }
    console.log("");

    // 6. 点击登录
    console.log("6. 点击登录按钮...");
    if (submitVisible) {
      await submitButton.click();
      console.log("   已点击登录，等待跳转...");

      // 等待一段时间观察跳转
      await new Promise(r => setTimeout(r, 5000));
      console.log(`   当前URL: ${page.url()}`);
    }
    console.log("");

    // 7. 打印 cookies
    console.log("7. 当前 Cookies:");
    const cookies = await context.cookies();
    for (const cookie of cookies) {
      console.log(`   ${cookie.name}=${cookie.value.slice(0, 50)}... (domain=${cookie.domain})`);
    }
    console.log("");

    console.log("=== 录制结束 ===\n");
    console.log("按 Enter 键关闭浏览器...");
    await new Promise(r => process.stdin.once("data", r));

  } catch (error) {
    console.error("录制出错:", error);
  } finally {
    await browser.close();
  }
}

recordLogin();
