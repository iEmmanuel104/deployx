import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, registerUser, authHeaders } from "../../__tests__/setup.js";

async function createProject(app: FastifyInstance, token: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: authHeaders(token),
    payload: {
      name: "Metrics App",
      slug: "metrics-app",
      source_type: "git",
      git_repo: "https://github.com/u/r",
      build_type: "nixpacks",
    },
  });
  return JSON.parse(res.body).data.id;
}

describe("A3 metrics guards", () => {
  let app: FastifyInstance;
  let token: string;
  let projectId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const u = await registerUser(app, { email: "metrics@test.com" });
    token = u.accessToken;
    projectId = await createProject(app, token);
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects 400 when from > to", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/metrics?from=2026-05-10T00:00:00.000Z&to=2026-05-01T00:00:00.000Z`,
      headers: authHeaders(token),
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 200 with empty array for a valid window", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/metrics`,
      headers: authHeaders(token),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });
});
