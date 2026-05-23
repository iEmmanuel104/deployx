import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp } from "../../__tests__/setup.js";
import { sql } from "drizzle-orm";

// SEC-specific auth tests for S2 (account lockout), S3 (refresh token
// versioning), S6 (Origin check on refresh). These run against a fresh
// app per test so lockout state never leaks between cases.

interface UserRow {
  id: string;
  failedLoginAttempts: number | null;
  lockedUntil: string | null;
  tokenVersion: number | null;
}

async function registerAndLogin(
  app: FastifyInstance,
  email: string,
  password = "password123",
): Promise<{ accessToken: string; refreshCookie: string; userId: string }> {
  const reg = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email, password, name: "Test User" },
  });
  expect(reg.statusCode).toBe(201);
  const body = JSON.parse(reg.body) as {
    data: { user: { id: string }; accessToken: string };
  };
  const cookies = reg.cookies as Array<{ name: string; value: string }>;
  const refresh = cookies.find((c) => c.name === "refresh_token");
  return {
    accessToken: body.data.accessToken,
    refreshCookie: refresh!.value,
    userId: body.data.user.id,
  };
}

function getUserRow(app: FastifyInstance, userId: string): UserRow {
  const rows = app.db.all(
    sql`SELECT id,
               failed_login_attempts AS "failedLoginAttempts",
               locked_until AS "lockedUntil",
               token_version AS "tokenVersion"
        FROM users WHERE id = ${userId}`,
  ) as UserRow[];
  return rows[0]!;
}

describe("Auth Routes — SEC hardening", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── S2 — Account lockout ──────────────────────────────────────────────────

  describe("S2 — Account lockout", () => {
    it("increments failed_login_attempts on bad password", async () => {
      const { userId } = await registerAndLogin(app, "s2-counter@test.com");

      await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "s2-counter@test.com", password: "wrong" },
      });

      const row = getUserRow(app, userId);
      expect(row.failedLoginAttempts).toBe(1);
      expect(row.lockedUntil).toBeNull();
    });

    // Five sequential bcrypt(12) comparisons add up — give the test enough
    // time to finish even on slow CI runners.
    it(
      "locks the account after 5 failed attempts",
      async () => {
        const { userId } = await registerAndLogin(app, "s2-lock@test.com");

        for (let i = 0; i < 5; i++) {
          await app.inject({
            method: "POST",
            url: "/api/v1/auth/login",
            payload: { email: "s2-lock@test.com", password: "wrong" },
          });
        }

        const row = getUserRow(app, userId);
        expect(row.failedLoginAttempts).toBe(5);
        expect(row.lockedUntil).not.toBeNull();
        const lockedMs = Date.parse(row.lockedUntil!);
        expect(lockedMs).toBeGreaterThan(Date.now());
        expect(lockedMs - Date.now()).toBeGreaterThan(14 * 60 * 1000);
        expect(lockedMs - Date.now()).toBeLessThan(16 * 60 * 1000);
      },
      30_000,
    );

    it("rejects login while locked even with correct password", async () => {
      const { userId } = await registerAndLogin(app, "s2-reject@test.com");
      // Manually plant a future lockout.
      const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      app.db.run(
        sql`UPDATE users SET failed_login_attempts = 5, locked_until = ${future} WHERE id = ${userId}`,
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "s2-reject@test.com", password: "password123" },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.error.message).toMatch(/locked/i);
    });

    it("clears the counter on successful login after past lockout", async () => {
      const { userId } = await registerAndLogin(app, "s2-clear@test.com");
      // Simulate an old expired lockout + nonzero attempts.
      const past = new Date(Date.now() - 60 * 1000).toISOString();
      app.db.run(
        sql`UPDATE users SET failed_login_attempts = 3, locked_until = ${past} WHERE id = ${userId}`,
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "s2-clear@test.com", password: "password123" },
      });
      expect(res.statusCode).toBe(200);

      const row = getUserRow(app, userId);
      expect(row.failedLoginAttempts).toBe(0);
      expect(row.lockedUntil).toBeNull();
    });
  });

  // ─── S3 — Refresh token versioning ─────────────────────────────────────────

  describe("S3 — Refresh token versioning", () => {
    it("bumps token_version on logout", async () => {
      const { userId, refreshCookie } = await registerAndLogin(
        app,
        "s3-bump@test.com",
      );
      const before = getUserRow(app, userId);
      expect(before.tokenVersion).toBe(0);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/logout",
        cookies: { refresh_token: refreshCookie },
      });
      expect(res.statusCode).toBe(200);

      const after = getUserRow(app, userId);
      expect(after.tokenVersion).toBe(1);
    });

    it("rejects a stale refresh token after logout", async () => {
      const { refreshCookie } = await registerAndLogin(
        app,
        "s3-stale@test.com",
      );

      // Logout bumps tokenVersion → outstanding cookie should now be revoked.
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/logout",
        cookies: { refresh_token: refreshCookie },
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        cookies: { refresh_token: refreshCookie },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.error.message).toMatch(/revoked|invalid/i);
    });

    it("accepts a refresh token whose ver matches the user", async () => {
      const { refreshCookie } = await registerAndLogin(
        app,
        "s3-valid@test.com",
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        cookies: { refresh_token: refreshCookie },
      });

      expect(res.statusCode).toBe(200);
    });
  });

  // ─── S6 — Origin check on refresh ──────────────────────────────────────────

  describe("S6 — Origin check on refresh", () => {
    it("allows requests with no Origin (CLI / server-to-server)", async () => {
      const { refreshCookie } = await registerAndLogin(
        app,
        "s6-no-origin@test.com",
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        cookies: { refresh_token: refreshCookie },
      });
      expect(res.statusCode).toBe(200);
    });

    it("allows requests from localhost", async () => {
      const { refreshCookie } = await registerAndLogin(
        app,
        "s6-localhost@test.com",
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        cookies: { refresh_token: refreshCookie },
        headers: { origin: "http://localhost:3000" },
      });
      expect(res.statusCode).toBe(200);
    });

    it("allows requests from the configured PLATFORM_DOMAIN", async () => {
      const { refreshCookie } = await registerAndLogin(
        app,
        "s6-platform@test.com",
      );

      // PLATFORM_DOMAIN is set to test.deployx.dev in setup.ts.
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        cookies: { refresh_token: refreshCookie },
        headers: { origin: "https://test.deployx.dev" },
      });
      expect(res.statusCode).toBe(200);
    });

    it("allows requests from a subdomain of PLATFORM_DOMAIN", async () => {
      const { refreshCookie } = await registerAndLogin(
        app,
        "s6-subdomain@test.com",
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        cookies: { refresh_token: refreshCookie },
        headers: { origin: "https://app.test.deployx.dev" },
      });
      expect(res.statusCode).toBe(200);
    });

    it("rejects requests from a foreign origin — 403", async () => {
      const { refreshCookie } = await registerAndLogin(
        app,
        "s6-foreign@test.com",
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        cookies: { refresh_token: refreshCookie },
        headers: { origin: "https://evil.example.com" },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error.message).toMatch(/origin/i);
    });

    it("rejects an unparseable Origin header — 403", async () => {
      const { refreshCookie } = await registerAndLogin(
        app,
        "s6-bad-origin@test.com",
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        cookies: { refresh_token: refreshCookie },
        headers: { origin: "not a url" },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ─── S7 — Request IDs in error envelope ────────────────────────────────────

  describe("S7 — Request IDs", () => {
    it("includes a requestId in error responses", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "nobody@nowhere.com", password: "password123" },
      });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.error.requestId).toBeTruthy();
      // ULID is 26 chars, Crockford base32.
      expect(body.error.requestId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    });

    it("surfaces request id in x-request-id response header", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/healthz",
      });
      expect(res.statusCode).toBe(200);
      const reqId = res.headers["x-request-id"];
      expect(typeof reqId).toBe("string");
      expect(reqId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    });
  });
});
