import { defineConfig, devices } from "@playwright/test";
import { E2E_CODE_HASH } from "./tests/e2e/fixtures.ts";

const PORT = 4173;

/**
 * End-to-end tests run against the production build in mock mode:
 * no API key, no costs, the same server code as in production.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run build && node src/server/index.ts",
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      KNOWLEDGE_DIR: "./knowledge.example",
      ANTHROPIC_API_KEY: "",
      ACCESS_CODE_HASH: E2E_CODE_HASH,
      SESSION_SECRET: "e2e-session-secret-that-is-long-enough",
      RATE_LIMIT_PER_MINUTE: "1000",
      RATE_LIMIT_PER_DAY: "10000",
      UNLOCK_MAX_ATTEMPTS: "50",
      MOCK_DELAY_MS: "15",
      PUBLIC_REPO_URL: "https://github.com/example/load-manasses",
    },
  },
});
