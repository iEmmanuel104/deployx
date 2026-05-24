import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  registerUser,
  authHeaders,
} from "../../__tests__/setup.js";

function sign(body: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

async function createProjectAndGetWebhookInfo(
  app: FastifyInstance,
  token: string,
  slug: string,
): Promise<{ projectId: string; url: string; secret: string }> {
  const createRes = await app.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: authHeaders(token),
    payload: {
      name: `wh-${slug}`,
      slug,
      source_type: "git",
      git_repo: "https://github.com/test/repo",
      build_type: "nixpacks",
    },
  });
  expect(createRes.statusCode).toBe(201);
  const projectId = JSON.parse(createRes.body).data.id as string;

  const infoRes = await app.inject({
    method: "GET",
    url: `/api/v1/projects/${projectId}/webhook-info`,
    headers: authHeaders(token),
  });
  expect(infoRes.statusCode).toBe(200);
  const info = JSON.parse(infoRes.body).data as { url: string; secret: string };

  return { projectId, url: info.url, secret: info.secret };
}

describe("Webhook Routes", () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    const user = await registerUser(app, {
      email: "webhookowner@test.com",
      password: "password123",
      name: "Webhook Owner",
    });
    token = user.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── webhook-info ──────────────────────────────────────────────────────────

  it("webhook-info returns url + deterministic secret for owner", async () => {
    const { projectId, url, secret } = await createProjectAndGetWebhookInfo(
      app,
      token,
      "wh-info",
    );
    expect(url).toContain(`/api/v1/webhooks/${projectId}`);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);

    // Calling again returns identical secret (deterministic from ENCRYPTION_KEY)
    const again = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/webhook-info`,
      headers: authHeaders(token),
    });
    expect(JSON.parse(again.body).data.secret).toBe(secret);
  });

  it("webhook-info refuses non-owner — 404", async () => {
    const { projectId } = await createProjectAndGetWebhookInfo(
      app,
      token,
      "wh-info-foreign",
    );
    const stranger = await registerUser(app, {
      email: "stranger@test.com",
      password: "password123",
      name: "Stranger",
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/webhook-info`,
      headers: authHeaders(stranger.accessToken),
    });
    expect(res.statusCode).toBe(404);
  });

  it("webhook-info requires auth — 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/projects/anything/webhook-info",
    });
    expect(res.statusCode).toBe(401);
  });

  // ─── webhook delivery ──────────────────────────────────────────────────────

  it("valid signature → 202 with deploymentId/jobId, trigger=git_push", async () => {
    const { projectId, secret } = await createProjectAndGetWebhookInfo(
      app,
      token,
      "wh-valid",
    );

    const payload = {
      ref: "refs/heads/main",
      after: "abc123def456",
      head_commit: { id: "abc123def456", message: "fix: a bug" },
    };
    const body = JSON.stringify(payload);

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/webhooks/${projectId}`,
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(body, secret),
      },
      payload: body,
    });

    expect(res.statusCode).toBe(202);
    const responseBody = JSON.parse(res.body);
    expect(responseBody.ok).toBe(true);
    expect(responseBody.data.deploymentId).toBeTruthy();
    expect(responseBody.data.jobId).toBeTruthy();
    expect(responseBody.data.trigger).toBe("git_push");
  });

  it("invalid signature → 401", async () => {
    const { projectId } = await createProjectAndGetWebhookInfo(
      app,
      token,
      "wh-bad-sig",
    );
    const body = JSON.stringify({ ref: "refs/heads/main" });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/webhooks/${projectId}`,
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(body, "wrong-secret"),
      },
      payload: body,
    });

    expect(res.statusCode).toBe(401);
    const responseBody = JSON.parse(res.body);
    expect(responseBody.ok).toBe(false);
    expect(responseBody.error.code).toBe("INVALID_SIGNATURE");
  });

  it("missing signature header → 401", async () => {
    const { projectId } = await createProjectAndGetWebhookInfo(
      app,
      token,
      "wh-no-sig",
    );
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/webhooks/${projectId}`,
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ ref: "refs/heads/main" }),
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe("MISSING_SIGNATURE");
  });

  it("unknown projectId → 404 (signature check still runs, but project not found)", async () => {
    // Signature is meaningless without the project, but missing-signature
    // path returns 401 first — to actually hit 404 we need a valid-looking
    // header so the route gets past the missing-header guard.
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/01HZZZZZZZZZZZZZZZZZZZZZZZ",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": "sha256=" + "0".repeat(64),
      },
      payload: "{}",
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe("NOT_FOUND");
  });

  it("body tampering after signing → 401", async () => {
    const { projectId, secret } = await createProjectAndGetWebhookInfo(
      app,
      token,
      "wh-tamper",
    );
    const original = JSON.stringify({ ref: "refs/heads/main", x: 1 });
    const tampered = JSON.stringify({ ref: "refs/heads/main", x: 2 });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/webhooks/${projectId}`,
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(original, secret),
      },
      payload: tampered,
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe("INVALID_SIGNATURE");
  });

  it("second concurrent push → 409 (BuildAlreadyInProgress dedup)", async () => {
    const { projectId, secret } = await createProjectAndGetWebhookInfo(
      app,
      token,
      "wh-dedup",
    );
    const body = JSON.stringify({ ref: "refs/heads/main", n: 1 });
    const headers = {
      "content-type": "application/json",
      "x-hub-signature-256": sign(body, secret),
    };

    const first = await app.inject({
      method: "POST",
      url: `/api/v1/webhooks/${projectId}`,
      headers,
      payload: body,
    });
    expect(first.statusCode).toBe(202);

    const second = await app.inject({
      method: "POST",
      url: `/api/v1/webhooks/${projectId}`,
      headers,
      payload: body,
    });
    expect(second.statusCode).toBe(409);
    expect(JSON.parse(second.body).error.code).toBe("BUILD_ALREADY_IN_PROGRESS");
  });

  it("secret derived per-project — siblings cannot cross-sign", async () => {
    const a = await createProjectAndGetWebhookInfo(app, token, "wh-iso-a");
    const b = await createProjectAndGetWebhookInfo(app, token, "wh-iso-b");
    expect(a.secret).not.toBe(b.secret);

    const body = JSON.stringify({ ref: "refs/heads/main" });
    // Sign with A's secret but POST to B's webhook → must reject.
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/webhooks/${b.projectId}`,
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(body, a.secret),
      },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe("INVALID_SIGNATURE");
  });
});
