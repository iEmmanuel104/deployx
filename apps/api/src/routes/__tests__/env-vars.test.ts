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

describe("Env var routes", () => {
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

  it("lists env vars — 200, empty array", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/env`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data).toEqual([]);
  });

  it("sets an env var — 201, returns key but NOT value", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/env`,
      headers: authHeaders(token),
      payload: { key: "DATABASE_URL", value: "postgres://localhost:5432/db" },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data.key).toBe("DATABASE_URL");
    expect(body.data.id).toBeTruthy();
    // Must NOT include encrypted value or IV
    expect(body.data.valueEnc).toBeUndefined();
    expect(body.data.value_enc).toBeUndefined();
    expect(body.data.iv).toBeUndefined();
    expect(body.data.value).toBeUndefined();
  });

  it("upserts env var — setting same key twice yields only 1 record", async () => {
    // Set initial value
    await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/env`,
      headers: authHeaders(token),
      payload: { key: "MY_VAR", value: "original" },
    });

    // Overwrite with new value
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/env`,
      headers: authHeaders(token),
      payload: { key: "MY_VAR", value: "updated" },
    });

    expect(res.statusCode).toBe(201);

    // List and verify only one MY_VAR exists
    const listRes = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/env`,
      headers: authHeaders(token),
    });

    const listBody = JSON.parse(listRes.body);
    const myVarEntries = listBody.data.filter(
      (v: { key: string }) => v.key === "MY_VAR",
    );
    expect(myVarEntries).toHaveLength(1);
  });

  it("lists env vars — returns keys only, no valueEnc or iv", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/env`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    for (const envVar of body.data) {
      expect(envVar.key).toBeTruthy();
      expect(envVar.id).toBeTruthy();
      // Encrypted fields must never appear in the list response
      expect(envVar.valueEnc).toBeUndefined();
      expect(envVar.value_enc).toBeUndefined();
      expect(envVar.iv).toBeUndefined();
      expect(envVar.value).toBeUndefined();
    }
  });

  it("deletes an env var — 200", async () => {
    // Add one to delete
    await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/env`,
      headers: authHeaders(token),
      payload: { key: "DELETE_ME", value: "gone" },
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/env/DELETE_ME`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data.deleted).toBe(true);
    expect(body.data.key).toBe("DELETE_ME");
  });

  it("returns 404 when deleting non-existent env var", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/env/DOES_NOT_EXIST`,
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
  });
});
