import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

/**
 * T28 — Live happy-path against the docker-compose.local.yml stack.
 *
 * What this proves:
 *   register → /projects → create a real Git-backed project (keep-alive-pinger)
 *   → wait for status to reach "running" → add a *.localtest.me domain
 *   → curl the public route through Traefik → assert the JSON response.
 *
 * Run via scripts/up-local.sh first:
 *   scripts/up-local.sh
 *   RUN_E2E=1 pnpm -F @deployx/dashboard test:e2e --grep "happy path"
 *
 * Skipped by default (no RUN_E2E) because it requires a running stack.
 */
const RUN_E2E = process.env["RUN_E2E"] === "1";

// localtest.me resolves *anything*.localtest.me to 127.0.0.1, so Traefik's
// Host-header routing can match our test domain without touching real DNS.
const TEST_DOMAIN_SUFFIX = "localtest.me";

// Five minutes is enough for a fresh nixpacks build of a tiny Node app —
// pulls the base image, installs deps, runs the build, then starts the
// runtime container. Anything longer indicates a real bug we should surface.
const DEPLOY_TIMEOUT_MS = 5 * 60 * 1000;

test.describe("DeployX live happy path (T28)", () => {
  test.skip(!RUN_E2E, "Requires live docker-compose stack — set RUN_E2E=1");
  // Each step in this flow is meaningfully slow (compose build, git clone,
  // image pull, container start). Keep the whole test under 10 minutes wall.
  test.setTimeout(10 * 60 * 1000);

  test("register → create project → deploy keep-alive-pinger → add domain → hit it", async ({
    page,
    request,
  }, testInfo) => {
    const rand = Math.random().toString(36).slice(2, 8);
    const email = `e2e-${Date.now()}-${rand}@deployx.test`;
    const password = "E2EPasswordTest1!";
    const slug = `pinger-e2e-${rand}`;
    const projectName = "Pinger E2E";
    const subdomain = `${slug}.${TEST_DOMAIN_SUFFIX}`;

    testInfo.annotations.push({ type: "fixture-slug", description: slug });
    testInfo.annotations.push({ type: "fixture-domain", description: subdomain });

    // Register via API first to grab an access token we can use for direct
    // polling. We still drive the UI for the user-visible registration so the
    // dashboard's auth cookie is set as a normal browser would.
    const apiTokens = await registerViaApi(request, { email, password, name: "E2E User" });

    await loginViaUi(page, { email, password });

    // Land on /projects after login
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByText(/no projects yet/i)).toBeVisible();

    await createProject(page, {
      name: projectName,
      slug,
      gitRepo: "https://github.com/iEmmanuel104/keep-alive-pinger.git",
      gitBranch: "main",
      buildType: "nixpacks",
      port: 3000,
    });

    // Project page renders the project header
    await expect(page).toHaveURL(new RegExp(`/projects/${slug}$`));
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

    await triggerDeployIfNeeded(page);

    // Poll the API directly (much cheaper than re-rendering the page) for the
    // project's status to reach "running".
    const projectId = await getProjectIdBySlug(request, apiTokens.accessToken, slug);
    expect(projectId, "project id should resolve via /api/v1/projects").toBeTruthy();

    const finalStatus = await waitForProjectStatus(
      request,
      apiTokens.accessToken,
      projectId,
      ["running"],
      DEPLOY_TIMEOUT_MS,
    );

    expect(
      finalStatus,
      `expected project to reach 'running'; got '${finalStatus}'. Check api logs for the actual failure.`,
    ).toBe("running");

    // --- Domain step ---
    await page.goto(`/projects/${slug}`);
    await page.getByRole("button", { name: /^domains$/i }).click();
    await page.getByPlaceholder("example.com").fill(subdomain);
    await page.getByRole("button", { name: /add domain/i }).click();
    await expect(page.getByText(subdomain)).toBeVisible({ timeout: 10_000 });

    // --- Curl the public domain through Traefik. Traefik routes by Host
    //     header, so we send Host: <subdomain> to http://localhost. Give Traefik
    //     a few seconds to pick up the new label / dynamic config. ---
    const body = await fetchThroughTraefik(request, subdomain, 60_000);
    expect(body, `failed to reach ${subdomain} through Traefik`).not.toBeNull();

    // keep-alive-pinger responds with JSON like { running: true, ... } on /.
    // Accept either the structured response or any 2xx body — we just need to
    // prove end-to-end routing works.
    if (typeof body === "object" && body !== null && "running" in (body as Record<string, unknown>)) {
      expect((body as { running: unknown }).running).toBe(true);
    }
  });
});

interface AuthTokens {
  accessToken: string;
}

async function registerViaApi(
  request: APIRequestContext,
  opts: { email: string; password: string; name: string },
): Promise<AuthTokens> {
  const res = await request.post("http://localhost/api/v1/auth/register", {
    data: opts,
    headers: { "Content-Type": "application/json" },
  });
  expect(res.ok(), `register API returned ${res.status()}: ${await res.text()}`).toBeTruthy();
  const json = (await res.json()) as {
    ok: boolean;
    data: { accessToken: string };
  };
  expect(json.ok).toBe(true);
  return { accessToken: json.data.accessToken };
}

async function loginViaUi(page: Page, opts: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(opts.email);
  await page.getByLabel(/password/i).fill(opts.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/projects", { timeout: 15_000 });
}

async function createProject(
  page: Page,
  opts: {
    name: string;
    slug: string;
    gitRepo: string;
    gitBranch: string;
    buildType: "nixpacks" | "railpack" | "dockerfile";
    port: number;
  },
): Promise<void> {
  await page.getByRole("link", { name: /create project/i }).click();
  await expect(page).toHaveURL(/\/projects\/new$/);

  await page.getByLabel(/project name/i).fill(opts.name);

  // The slug is auto-derived from name; overwrite to keep it deterministic
  // and unique per run regardless of the autoSlug rules.
  await page.getByLabel(/^slug$/i).fill(opts.slug);

  await page.getByLabel(/source type/i).selectOption("git");
  await page.getByLabel(/git repository url/i).fill(opts.gitRepo);
  await page.getByLabel(/branch/i).fill(opts.gitBranch);
  await page.getByLabel(/build type/i).selectOption(opts.buildType);
  await page.getByLabel(/application port/i).fill(String(opts.port));

  await page.getByRole("button", { name: /create project/i }).click();

  // Redirected to /projects/<slug>
  await page.waitForURL(new RegExp(`/projects/${opts.slug}$`), { timeout: 20_000 });
}

async function triggerDeployIfNeeded(page: Page): Promise<void> {
  // Most flows kick off a deploy automatically on create. If there's a
  // visible "Deploy" button on the overview tab we click it as a belt-and-braces
  // step; ignore failures because the build may already be in progress.
  const deployBtn = page.getByRole("button", { name: /^deploy$/i }).first();
  try {
    if (await deployBtn.isVisible({ timeout: 2_000 })) {
      await deployBtn.click();
    }
  } catch {
    // Button isn't present — first deploy was auto-triggered. Continue.
  }
}

async function getProjectIdBySlug(
  request: APIRequestContext,
  token: string,
  slug: string,
): Promise<string> {
  const res = await request.get("http://localhost/api/v1/projects", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok(), `GET /api/v1/projects returned ${res.status()}`).toBeTruthy();
  const json = (await res.json()) as {
    ok: boolean;
    data: Array<{ id: string; slug: string }>;
  };
  const match = json.data.find((p) => p.slug === slug);
  expect(match, `no project with slug '${slug}' in projects list`).toBeTruthy();
  return match!.id;
}

async function waitForProjectStatus(
  request: APIRequestContext,
  token: string,
  projectId: string,
  targetStatuses: string[],
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let last = "unknown";
  const pollIntervalMs = 5_000;
  while (Date.now() < deadline) {
    const res = await request.get(`http://localhost/api/v1/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok()) {
      const json = (await res.json()) as {
        ok: boolean;
        data: { status: string };
      };
      last = json.data.status;
      if (targetStatuses.includes(last)) return last;
      // Terminal failure statuses — fail fast instead of waiting for timeout.
      if (last === "failed" || last === "crashed" || last === "error") {
        return last;
      }
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  return last;
}

async function fetchThroughTraefik(
  request: APIRequestContext,
  host: string,
  timeoutMs: number,
): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    try {
      const res = await request.get("http://localhost/", {
        headers: { Host: host },
        timeout: 5_000,
      });
      if (res.ok()) {
        const text = await res.text();
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return text;
        }
      }
      lastErr = new Error(`HTTP ${res.status()}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw lastErr ?? new Error("timed out fetching through Traefik");
}
