import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright runs end-to-end smoke tests against a *running* DeployX stack
 * brought up via the prod docker-compose:
 *
 *   docker compose --env-file .env.local -f docker-compose.local.yml up -d
 *
 * The current specs are mostly `.skip`'d because they depend on that live
 * stack; the suite is wired up so that once the stack is reachable from CI
 * (or the developer flips a `RUN_E2E=1` env var), the same files run as
 * full E2E. See docs/RESTORE.md for the bring-up procedure.
 */
const PLATFORM_DOMAIN = process.env["PLATFORM_DOMAIN"] ?? "localhost";

export default defineConfig({
  testDir: "./playwright",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  workers: 1,
  reporter: process.env["CI"] ? "github" : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://${PLATFORM_DOMAIN}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
