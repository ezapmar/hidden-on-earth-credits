/* Unit and data tests. Browser behaviour (gestures, routing, the service worker) is in
   tests/e2e and runs under Playwright: jsdom has no layout, so it cannot test the game screen. */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.js", "tests/data/**/*.test.js"],
    // Node by default; a DOM test opts in with `// @vitest-environment jsdom`.
    environment: "node",
    restoreMocks: true,
  },
});
