import { test, expect } from "@playwright/test";

test("login to max-optics plane", async ({ page }) => {
  await page.goto("https://support.max-optics.com/");

  // 模拟人慢速输入，避免触发反自动化检测
  const emailInput = page.getByRole("textbox", { name: "Email" });
  await emailInput.click();
  await emailInput.pressSequentially("liangshaojie@max-optics.com", { delay: 80 });

  await page.getByRole("button", { name: "Continue" }).click();

  // 等待密码框出现
  await page.getByRole("textbox", { name: "Password" }).waitFor({ timeout: 5000 });

  const passwordInput = page.getByRole("textbox", { name: "Password" });
  await passwordInput.click();
  await passwordInput.pressSequentially("Lsj@890305", { delay: 80 });

  await page.getByRole("button", { name: "Continue" }).click();

  // 等待登录成功（工作空间页面）
  await page.waitForURL(/\/max-optics\/?$/, { timeout: 10000 });
});
