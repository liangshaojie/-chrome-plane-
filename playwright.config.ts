import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_PLANE_INSTANCE_URL ?? "https://app.plane.so",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
  webServer: undefined,
});
