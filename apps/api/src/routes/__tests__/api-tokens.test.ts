import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, registerUser, authHeaders } from "../../__tests__/setup.js";

describe("API token routes", () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    const u = await registerUser(app, { email: "tokens@test.com" });
    token = u.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates a token — 201 with secret shown once", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/api-tokens",
      headers: authHeaders(token),
      payload: { name: "ci-token" },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data.id).toBeTruthy();
    expect(body.data.name).toBe("ci-token");
    expect(body.data.token).toMatch(/^dxat_[0-9A-HJKMNP-TV-Z]{26}_/);
  });

  it("lists tokens without exposing secret material", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/api-tokens",
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    for (const row of body.data) {
      expect(row.token).toBeUndefined();
      expect(row.tokenHash).toBeUndefined();
      expect(row.id).toBeTruthy();
      expect(row.name).toBeTruthy();
    }
  });

  it("revokes a token — 200, then 404 on re-delete", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/api-tokens",
      headers: authHeaders(token),
      payload: { name: "revoke-me" },
    });
    const id = JSON.parse(create.body).data.id;

    const del = await app.inject({
      method: "DELETE",
      url: `/api/v1/api-tokens/${id}`,
      headers: authHeaders(token),
    });
    expect(del.statusCode).toBe(200);
    expect(JSON.parse(del.body).data.revoked).toBe(true);

    const again = await app.inject({
      method: "DELETE",
      url: `/api/v1/api-tokens/${id}`,
      headers: authHeaders(token),
    });
    expect(again.statusCode).toBe(404);
  });

  it("user A cannot revoke user B's token", async () => {
    const userB = await registerUser(app, {
      email: "tokens-b@test.com",
      password: "password123",
      name: "B",
    });

    const createA = await app.inject({
      method: "POST",
      url: "/api/v1/api-tokens",
      headers: authHeaders(token),
      payload: { name: "a-token" },
    });
    const idA = JSON.parse(createA.body).data.id;

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/api-tokens/${idA}`,
      headers: authHeaders(userB.accessToken),
    });
    expect(res.statusCode).toBe(404);
  });

  it("rejects unauthenticated requests — 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/api-tokens",
    });
    expect(res.statusCode).toBe(401);
  });
});
