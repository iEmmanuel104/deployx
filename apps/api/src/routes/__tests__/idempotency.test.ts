import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, registerUser, authHeaders } from "../../__tests__/setup.js";

async function createProject(
  app: FastifyInstance,
  token: string,
  slug: string,
) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: authHeaders(token),
    payload: {
      name: "Idem App",
      slug,
      source_type: "git",
      git_repo: "https://github.com/u/r",
      build_type: "nixpacks",
    },
  });
  return JSON.parse(res.body).data.id;
}

describe("Idempotency-Key", () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    const u = await registerUser(app, { email: "idem@test.com" });
    token = u.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the cached response when the same key is replayed", async () => {
    const projectId = await createProject(app, token, "idem-replay");

    const first = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/deploy`,
      headers: { ...authHeaders(token), "idempotency-key": "key-aaa" },
    });
    expect(first.statusCode).toBe(202);
    const firstBody = JSON.parse(first.body);

    const second = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/deploy`,
      headers: { ...authHeaders(token), "idempotency-key": "key-aaa" },
    });
    expect(second.statusCode).toBe(202);
    const secondBody = JSON.parse(second.body);

    expect(secondBody.data.deploymentId).toBe(firstBody.data.deploymentId);
    expect(secondBody.data.jobId).toBe(firstBody.data.jobId);
  });

  it("rejects 422 when the same key is reused with a different request hash", async () => {
    const p1 = await createProject(app, token, "idem-conflict-1");
    const p2 = await createProject(app, token, "idem-conflict-2");

    const first = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${p1}/deploy`,
      headers: { ...authHeaders(token), "idempotency-key": "key-bbb" },
    });
    expect(first.statusCode).toBe(202);

    // Different URL path -> different request hash with the same key
    const second = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${p2}/deploy`,
      headers: { ...authHeaders(token), "idempotency-key": "key-bbb" },
    });
    expect(second.statusCode).toBe(422);
  });

  it("falls through normally when no Idempotency-Key is provided (BUILD dedup still applies on same project)", async () => {
    // Idempotency and build-dedup are layered: idempotency dedupes by
    // (user, key) — build-dedup protects against parallel builds for the same
    // project even without a key. Same project, two deploys, no key: first
    // 202, second 409 BUILD_ALREADY_IN_PROGRESS.
    const projectId = await createProject(app, token, "idem-no-header");

    const a = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/deploy`,
      headers: authHeaders(token),
    });
    const b = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/deploy`,
      headers: authHeaders(token),
    });

    expect(a.statusCode).toBe(202);
    expect(b.statusCode).toBe(409);
    const bodyB = JSON.parse(b.body);
    expect(bodyB.ok).toBe(false);
    expect(bodyB.error.code).toBe("BUILD_ALREADY_IN_PROGRESS");
  });

  it("two deploys of DIFFERENT projects without a key both succeed", async () => {
    const p1 = await createProject(app, token, "idem-distinct-a");
    const p2 = await createProject(app, token, "idem-distinct-b");

    const a = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${p1}/deploy`,
      headers: authHeaders(token),
    });
    const b = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${p2}/deploy`,
      headers: authHeaders(token),
    });

    expect(a.statusCode).toBe(202);
    expect(b.statusCode).toBe(202);
    expect(JSON.parse(a.body).data.deploymentId).not.toBe(
      JSON.parse(b.body).data.deploymentId,
    );
  });
});
