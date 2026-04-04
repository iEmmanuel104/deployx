import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, registerUser, authHeaders } from "../../__tests__/setup.js";

describe("Auth Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Register ──────────────────────────────────────────────────────────────

  it("registers a new user — 201 with user and accessToken", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "newuser@test.com", password: "password123", name: "New User" },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data.user.email).toBe("newuser@test.com");
    expect(body.data.user.name).toBe("New User");
    expect(body.data.user.role).toBe("member");
    expect(body.data.user.id).toBeTruthy();
    expect(body.data.accessToken).toBeTruthy();
  });

  it("sets a refresh_token cookie on register", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "cookie-check@test.com", password: "password123", name: "Cookie User" },
    });

    expect(res.statusCode).toBe(201);
    const cookies = res.cookies as Array<{ name: string; value: string; httpOnly?: boolean; path?: string }>;
    const refreshCookie = cookies.find((c) => c.name === "refresh_token");
    expect(refreshCookie).toBeTruthy();
    expect(refreshCookie!.httpOnly).toBe(true);
    expect(refreshCookie!.path).toBe("/api/v1/auth");
  });

  it("rejects duplicate email — 409", async () => {
    // First registration
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "dupe@test.com", password: "password123", name: "First" },
    });

    // Second registration with same email
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "dupe@test.com", password: "password123", name: "Second" },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
  });

  it("rejects invalid email — 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "not-an-email", password: "password123", name: "Bad Email" },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
  });

  it("rejects short password (<8 chars) — 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "short@test.com", password: "short", name: "Short Pass" },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
  });

  // ─── Login ─────────────────────────────────────────────────────────────────

  it("logs in with correct credentials — 200 with accessToken", async () => {
    // Register first
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "login@test.com", password: "password123", name: "Login User" },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "login@test.com", password: "password123" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data.accessToken).toBeTruthy();
    expect(body.data.user.email).toBe("login@test.com");
  });

  it("rejects wrong password — 401 'Invalid credentials'", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "wrongpass@test.com", password: "password123", name: "Wrong Pass" },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "wrongpass@test.com", password: "wrong-password" },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error.message).toBe("Invalid credentials");
  });

  it("rejects non-existent email — 401 'Invalid credentials' (no enumeration)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "nobody@nowhere.com", password: "password123" },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error.message).toBe("Invalid credentials");
  });

  // ─── Refresh ───────────────────────────────────────────────────────────────

  it("refreshes access token using refresh_token cookie — 200", async () => {
    // Register to get a refresh token cookie
    const registerRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "refresh@test.com", password: "password123", name: "Refresh User" },
    });

    expect(registerRes.statusCode).toBe(201);

    // Extract refresh_token from Set-Cookie header
    const cookies = registerRes.cookies as Array<{ name: string; value: string }>;
    const refreshCookie = cookies.find((c) => c.name === "refresh_token");
    expect(refreshCookie).toBeTruthy();

    // Use the refresh token
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      cookies: { refresh_token: refreshCookie!.value },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data.accessToken).toBeTruthy();
  });

  it("rejects refresh without cookie — 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
  });

  // ─── Logout ────────────────────────────────────────────────────────────────

  it("logs out — 200 and clears cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data.message).toBe("Logged out");

    // Verify refresh_token cookie is cleared
    const cookies = res.cookies as Array<{ name: string; value: string }>;
    const refreshCookie = cookies.find((c) => c.name === "refresh_token");
    expect(refreshCookie).toBeTruthy();
    expect(refreshCookie!.value).toBe("");
  });

  // ─── Protected route without token ─────────────────────────────────────────

  it("returns 401 when accessing protected route without token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/projects",
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
  });
});
