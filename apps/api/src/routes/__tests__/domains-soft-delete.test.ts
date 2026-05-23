import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, registerUser, authHeaders } from "../../__tests__/setup.js";

async function createProject(app: FastifyInstance, token: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: authHeaders(token),
    payload: {
      name: "DomSoft App",
      slug: "domsoft-app",
      source_type: "git",
      git_repo: "https://github.com/u/r",
      build_type: "nixpacks",
    },
  });
  return JSON.parse(res.body).data.id;
}

describe("A5 domains soft-delete", () => {
  let app: FastifyInstance;
  let token: string;
  let projectId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const u = await registerUser(app, { email: "domsoft@test.com" });
    token = u.accessToken;
    projectId = await createProject(app, token);
  });

  afterAll(async () => {
    await app.close();
  });

  it("soft-deleted domains do not appear in the list", async () => {
    const add = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/domains`,
      headers: authHeaders(token),
      payload: { domain: "delete-me.example.com" },
    });
    const id = JSON.parse(add.body).data.id;

    await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/domains/${id}`,
      headers: authHeaders(token),
    });

    const list = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/domains`,
      headers: authHeaders(token),
    });
    const body = JSON.parse(list.body);
    const found = body.data.find((d: { id: string }) => d.id === id);
    expect(found).toBeUndefined();
  });

  it("allows re-registering a previously soft-deleted domain name", async () => {
    const first = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/domains`,
      headers: authHeaders(token),
      payload: { domain: "recycle.example.com" },
    });
    const id = JSON.parse(first.body).data.id;

    await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/domains/${id}`,
      headers: authHeaders(token),
    });

    const second = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/domains`,
      headers: authHeaders(token),
      payload: { domain: "recycle.example.com" },
    });
    expect(second.statusCode).toBe(201);
  });

  it("re-deleting a soft-deleted domain returns 404", async () => {
    const add = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/domains`,
      headers: authHeaders(token),
      payload: { domain: "twice.example.com" },
    });
    const id = JSON.parse(add.body).data.id;

    const first = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/domains/${id}`,
      headers: authHeaders(token),
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/domains/${id}`,
      headers: authHeaders(token),
    });
    expect(second.statusCode).toBe(404);
  });
});
