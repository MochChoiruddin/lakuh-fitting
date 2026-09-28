import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve(
  "node_modules/.cache/ms-playwright",
);
export default defineConfig({
  testDir: "tests/browser",
  use: {
    baseURL: "http://localhost:3000",
    ...devices["iPhone 13"],
    defaultBrowserType: "chromium",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120000,
  },
  reporter: "list",
});
