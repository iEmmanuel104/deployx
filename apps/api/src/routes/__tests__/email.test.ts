import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { createTestApp } from "../../__tests__/setup.js";

interface TokenRow {
  token: string;
  userId: string;
  kind: string;
  expiresAt: string;
  usedAt: string | null;
}

function latestToken(
  app: FastifyInstance,
  userId: string,
  kind: "reset" | "verify",
): TokenRow | undefined {
  const rows = app.db.all(
    sql`SELECT token, user_id AS "userId", kind,
               expires_at AS "expiresAt", used_at AS "usedAt"
        FROM email_tokens WHERE user_id = ${userId} AND kind = ${kind}
        ORDER BY created_at DESC LIMIT 1`,
  ) as TokenRow[];
  return rows[0];
}

async function register(
  app: FastifyInstance,
  email: string,
): Promise<{ userId: string; accessToken: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email, password: "password123", name: "Test User" },
  });
  expect(res.statusCode).toBe(201);
  const body = JSON.parse(res.body) as {
    data: { user: { id: string }; accessToken: string };
  };
  return { userId: body.data.user.id, accessToken: body.data.accessToken };
}

describe("Email Routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── Verification token minted on register ───────────────────────────────

  it("mints a verify token row when a user registers", async () => {
    const { userId } = await register(app, "verify-mint@test.com");
    const row = latestToken(app, userId, "verify");
    expect(row).toBeTruthy();
    expect(row!.kind).toBe("verify");
    expect(row!.usedAt).toBeNull();
    expect(row!.token.length).toBe(64); // 32 bytes hex
  });

  // ─── Email verification flow ─────────────────────────────────────────────

  it("verifies email when given a valid token — 200", async () => {
    const { userId } = await register(app, "verify-ok@test.com");
    const row = latestToken(app, userId, "verify");

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/auth/verify-email/${row!.token}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data.verifiedAt).toBeTruthy();

    const users = app.db.all(
      sql`SELECT email_verified_at AS "emailVerifiedAt" FROM users WHERE id = ${userId}`,
    ) as Array<{ emailVerifiedAt: string | null }>;
    expect(users[0]!.emailVerifiedAt).toBeTruthy();
  });

  it("rejects a verify token reused twice — second call 400", async () => {
    const { userId } = await register(app, "verify-reuse@test.com");
    const row = latestToken(app, userId, "verify");

    const first = await app.inject({
      method: "POST",
      url: `/api/v1/auth/verify-email/${row!.token}`,
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: `/api/v1/auth/verify-email/${row!.token}`,
    });
    expect(second.statusCode).toBe(400);
  });

  it("rejects an unknown verify token — 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/auth/verify-email/${"a".repeat(64)}`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an expired verify token — 400", async () => {
    const { userId } = await register(app, "verify-expired@test.com");
    const row = latestToken(app, userId, "verify");
    // Force expiry in the past.
    app.db.run(
      sql`UPDATE email_tokens SET expires_at = '2000-01-01T00:00:00.000Z' WHERE token = ${row!.token}`,
    );

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/auth/verify-email/${row!.token}`,
    });
    expect(res.statusCode).toBe(400);
  });

  // ─── Password reset — request ────────────────────────────────────────────

  it("password-reset/request returns 200 + mints token for known email", async () => {
    const { userId } = await register(app, "reset-known@test.com");

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/request",
      payload: { email: "reset-known@test.com" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(latestToken(app, userId, "reset")).toBeTruthy();
  });

  it("password-reset/request returns 200 + no token for unknown email (no enumeration)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/request",
      payload: { email: "nobody@nowhere.com" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    const rows = app.db.all(
      sql`SELECT token FROM email_tokens WHERE kind = 'reset'`,
    ) as Array<{ token: string }>;
    expect(rows).toEqual([]);
  });

  it("password-reset/request rejects invalid email — 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/request",
      payload: { email: "not-an-email" },
    });
    expect(res.statusCode).toBe(400);
  });

  // ─── Password reset — confirm ────────────────────────────────────────────

  // 15s: this test chains register + bcrypt(12) reset-confirm + 2 logins
  // (bcrypt compare) inside one case — exceeds vitest's 5s default budget.
  it("password-reset/confirm rotates password, allows new password login", { timeout: 15000 }, async () => {
    await register(app, "reset-rotate@test.com");
    const requestRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/request",
      payload: { email: "reset-rotate@test.com" },
    });
    expect(requestRes.statusCode).toBe(200);

    const userIdRows = app.db.all(
      sql`SELECT id FROM users WHERE email = 'reset-rotate@test.com'`,
    ) as Array<{ id: string }>;
    const userId = userIdRows[0]!.id;
    const row = latestToken(app, userId, "reset");
    expect(row).toBeTruthy();

    const confirm = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/confirm",
      payload: { token: row!.token, newPassword: "new-password-123" },
    });
    expect(confirm.statusCode).toBe(200);

    // Old password no longer works.
    const oldLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "reset-rotate@test.com", password: "password123" },
    });
    expect(oldLogin.statusCode).toBe(401);

    // New password works.
    const newLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "reset-rotate@test.com", password: "new-password-123" },
    });
    expect(newLogin.statusCode).toBe(200);
  });

  it("password-reset/confirm bumps token_version (invalidates active sessions)", async () => {
    await register(app, "reset-ver@test.com");
    const userIdRows = app.db.all(
      sql`SELECT id FROM users WHERE email = 'reset-ver@test.com'`,
    ) as Array<{ id: string }>;
    const userId = userIdRows[0]!.id;

    const versionsBefore = app.db.all(
      sql`SELECT token_version AS "tokenVersion" FROM users WHERE id = ${userId}`,
    ) as Array<{ tokenVersion: number }>;

    await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/request",
      payload: { email: "reset-ver@test.com" },
    });
    const row = latestToken(app, userId, "reset");

    await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/confirm",
      payload: { token: row!.token, newPassword: "new-password-123" },
    });

    const versionsAfter = app.db.all(
      sql`SELECT token_version AS "tokenVersion" FROM users WHERE id = ${userId}`,
    ) as Array<{ tokenVersion: number }>;
    expect(versionsAfter[0]!.tokenVersion).toBe(versionsBefore[0]!.tokenVersion + 1);
  });

  it("password-reset/confirm rejects reused token — second call 400", async () => {
    await register(app, "reset-reuse@test.com");
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/request",
      payload: { email: "reset-reuse@test.com" },
    });
    const userIdRows = app.db.all(
      sql`SELECT id FROM users WHERE email = 'reset-reuse@test.com'`,
    ) as Array<{ id: string }>;
    const userId = userIdRows[0]!.id;
    const row = latestToken(app, userId, "reset");

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/confirm",
      payload: { token: row!.token, newPassword: "new-password-123" },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/confirm",
      payload: { token: row!.token, newPassword: "another-pass-456" },
    });
    expect(second.statusCode).toBe(400);
  });

  it("password-reset/confirm rejects token of wrong kind (verify ≠ reset)", async () => {
    const { userId } = await register(app, "reset-kind@test.com");
    const verifyRow = latestToken(app, userId, "verify");
    expect(verifyRow).toBeTruthy();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/confirm",
      payload: { token: verifyRow!.token, newPassword: "new-password-123" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("password-reset/confirm rejects expired token — 400", async () => {
    await register(app, "reset-exp@test.com");
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/request",
      payload: { email: "reset-exp@test.com" },
    });
    const userIdRows = app.db.all(
      sql`SELECT id FROM users WHERE email = 'reset-exp@test.com'`,
    ) as Array<{ id: string }>;
    const userId = userIdRows[0]!.id;
    const row = latestToken(app, userId, "reset");
    app.db.run(
      sql`UPDATE email_tokens SET expires_at = '2000-01-01T00:00:00.000Z' WHERE token = ${row!.token}`,
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/confirm",
      payload: { token: row!.token, newPassword: "new-password-123" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("password-reset/confirm rejects short newPassword — 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password-reset/confirm",
      payload: { token: "a".repeat(64), newPassword: "short" },
    });
    expect(res.statusCode).toBe(400);
  });
});
