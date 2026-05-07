import { test, expect } from "@playwright/test";

// 录制前可将此文件作为占位，录制后会覆盖它
test("placeholder", async ({ page }) => {
  await page.goto("/health");
  await expect(page).toHaveTitle(/.*/);
});
