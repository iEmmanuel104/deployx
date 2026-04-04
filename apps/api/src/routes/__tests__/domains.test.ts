import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, registerUser, authHeaders } from "../../__tests__/setup.js";

let app: FastifyInstance;
let token: string;
let projectId: string;

async function createProject(
  appInstance: FastifyInstance,
  authToken: string,
  slug = "test-app",
) {
  const res = await appInstance.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: authHeaders(authToken),
    payload: {
      name: "Test App",
      slug,
      source_type: "git",
      build_type: "nixpacks",
    },
  });
  return JSON.parse(res.body).data;
}

describe("Domain routes", () => {
  beforeAll(async () => {
    app = await createTestApp();
    const { accessToken } = await registerUser(app);
    token = accessToken;
    const project = await createProject(app, token);
    projectId = project.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it("lists domains — 200, empty array", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/domains`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data).toEqual([]);
  });

  it("adds a domain — 201, returns domain with sslStatus pending", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/domains`,
      headers: authHeaders(token),
      payload: { domain: "myapp.example.com" },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data.domain).toBe("myapp.example.com");
    expect(body.data.sslStatus).toBe("pending");
    expect(body.data.id).toBeTruthy();
    expect(body.data.projectId).toBe(projectId);
  });

  it("rejects duplicate domain — 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/domains`,
      headers: authHeaders(token),
      payload: { domain: "myapp.example.com" },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
  });

  it("rejects invalid domain — 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/domains`,
      headers: authHeaders(token),
      payload: { domain: "not a domain!!!" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("deletes a domain — 200", async () => {
    // First, add a domain to delete
    const addRes = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/domains`,
      headers: authHeaders(token),
      payload: { domain: "delete-me.example.com" },
    });
    const addedDomain = JSON.parse(addRes.body).data;

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/domains/${addedDomain.id}`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data.deleted).toBe(true);
    expect(body.data.id).toBe(addedDomain.id);
  });

  it("returns 404 when deleting non-existent domain", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/domains/nonexistent-id`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
  });
});
