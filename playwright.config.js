/* End-to-end tests: the real /play/ page in a real browser, served the way production serves it
   (static files from the repository root, no build). */
import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // A landscape tablet, the game's first platform.
    viewport: { width: 1180, height: 820 },
    // The service worker would cache the shell between tests; offline.spec.js turns it back on.
    serviceWorkers: "block",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1180, height: 820 } } },
  ],
  webServer: {
    command: `node tests/e2e/server.mjs ${PORT}`,
    url: `http://localhost:${PORT}/play/`,
    reuseExistingServer: !process.env.CI,
  },
});
