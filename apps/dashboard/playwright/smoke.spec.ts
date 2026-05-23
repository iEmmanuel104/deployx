import { test, expect } from "@playwright/test";

/**
 * T1 — happy-path E2E smoke (currently .skip because it requires the full
 * docker-compose stack to be up).
 *
 * To run: bring the stack up with
 *   docker compose --env-file .env.local -f docker-compose.local.yml up -d
 * then unskip these tests (RUN_E2E=1 or remove the test.skip block).
 */
const RUN_E2E = process.env["RUN_E2E"] === "1";

test.describe("DeployX happy path", () => {
  test.skip(!RUN_E2E, "Requires live docker-compose stack — set RUN_E2E=1");

  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /DeployX/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test("register → projects empty state → new project form", async ({ page }) => {
    const email = `e2e-${Date.now()}@deployx.test`;
    await page.goto("/register");
    await page.getByLabel(/name/i).fill("E2E");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill("E2EPasswordTest1!");
    await page.getByRole("button", { name: /create account/i }).click();
    await page.waitForURL("**/projects");
    await expect(page.getByText(/no projects yet/i)).toBeVisible();
    await page.getByRole("link", { name: /create project/i }).click();
    await expect(page).toHaveURL(/\/projects\/new/);
  });
});
