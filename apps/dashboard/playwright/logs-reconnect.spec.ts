import { test, expect } from "@playwright/test";

/**
 * T3 — LogsTab SSE reconnection behaviour.
 *
 * Requires the live stack + a logged-in user with a running project. Currently
 * .skip'd; unskip with RUN_E2E=1 once a fixture project is available.
 */
const RUN_E2E = process.env["RUN_E2E"] === "1";

test.describe("LogsTab SSE reconnection (F5)", () => {
  test.skip(!RUN_E2E, "Requires live docker-compose stack + seeded project");

  test("drops + reconnects with exponential backoff", async ({ page }) => {
    // Intercept the SSE endpoint and fail the first attempt; let subsequent
    // attempts pass through. This exercises the F5 backoff loop.
    let attempt = 0;
    await page.route(/\/api\/v1\/projects\/[^/]+\/logs/, async (route) => {
      attempt++;
      if (attempt === 1) {
        await route.abort("connectionfailed");
        return;
      }
      await route.continue();
    });

    await page.goto("/projects/test-fixture-project");
    await page.getByRole("button", { name: /^logs$/i }).click();

    // The status pill should flip to "Reconnecting (N/10)" briefly after the
    // first abort, then back to "Streaming" on the second attempt.
    await expect(page.getByText(/Reconnecting \(1\/10\)/)).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText(/Streaming/)).toBeVisible({ timeout: 15000 });
  });
});
