import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests run against the built app served by `vite preview`.
 * Without amplify_outputs.json the app runs in local demo mode, so these tests
 * need no AWS account. The demo lane adds the full demo-story test here.
 */
export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    // Local runs can point at an already-installed Chromium instead of downloading one.
    ...(process.env["PW_CHROMIUM"]
      ? { launchOptions: { executablePath: process.env["PW_CHROMIUM"] } }
      : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
  projects: [
    { name: "laptop", use: { ...devices["Desktop Chrome"] }, testIgnore: /phone\.spec\.ts$/ },
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: /phone\.spec\.ts$/ },
  ],
});
