import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 4,
  timeout: 120_000,
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: "http://localhost:5173",
    channel: "chrome",
    headless: true,
  },
  webServer: {
    command: "VITE_API_URL=http://localhost:8090/api vite dev --port 5173",
    port: 5173,
    reuseExistingServer: true,
    timeout: 30_000,
    env: {
      VITE_API_URL: "http://localhost:8090/api",
    },
  },
});
