import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { ulid } from "ulidx";
import bcrypt from "bcryptjs";
import { users as usersTable } from "@deployx/db";
import { success } from "../utils/response.js";

// The DB stream owns `packages/db/src/schema.ts` and adds the auth-hardening
// columns (failedLoginAttempts, lockedUntil, tokenVersion) in a separate
// stream. While the schema.ts in this worktree still reflects the pre-S2/S3
// shape, the test-DDL and the production migration both create those columns
// at runtime. We use a structurally widened reference for typing only — all
// reads/writes go through the same `users` table object.
type UsersTable = typeof usersTable & {
  failedLoginAttempts: import("drizzle-orm/sqlite-core").SQLiteColumn;
  lockedUntil: import("drizzle-orm/sqlite-core").SQLiteColumn;
  tokenVersion: import("drizzle-orm/sqlite-core").SQLiteColumn;
};
const users = usersTable as UsersTable;

const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string(),
});

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "strict" as const,
  path: "/api/v1/auth",
  maxAge: 7 * 24 * 60 * 60,
  secure: process.env["NODE_ENV"] === "production",
};

// S2 — CLAUDE.md mandates "5 failures = 15 min lockout".
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

interface UserRow {
  id: string;
  email: string;
  password: string;
  name: string;
  role: string;
  failedLoginAttempts: number | null;
  lockedUntil: string | null;
  tokenVersion: number | null;
}

interface RefreshClaim {
  sub: string;
  type?: string;
  ver?: number;
}

/** Sign a refresh token (different payload shape from access tokens). */
function signRefreshToken(
  fastify: FastifyInstance,
  userId: string,
  tokenVersion: number,
): string {
  // Refresh tokens intentionally carry a different payload than access tokens,
  // so we bypass the typed FastifyJWT overload. The `ver` claim binds the
  // token to the user's current tokenVersion — bumped on logout for S3.
  const sign = fastify.jwt.sign as unknown as (
    payload: Record<string, unknown>,
    opts: { expiresIn: string },
  ) => string;
  return sign(
    { sub: userId, type: "refresh", ver: tokenVersion },
    { expiresIn: "7d" },
  );
}

/**
 * S6 — Reject /refresh calls whose Origin header doesn't match the configured
 * platform domain. Defense in depth on top of httpOnly + SameSite=Strict.
 * Dev/test hosts (localhost, 127.0.0.1) are always accepted. Missing Origin
 * is allowed (CLI clients, curl, fetch without explicit origin).
 */
function isOriginAllowed(request: FastifyRequest): boolean {
  const origin = request.headers.origin;
  if (!origin || typeof origin !== "string") return true;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const host = url.hostname;

  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
    return true;
  }

  const platformDomain = process.env["PLATFORM_DOMAIN"];
  if (!platformDomain) {
    // Without a configured platform domain we have no reference to compare
    // against — fail closed for non-loopback origins.
    return false;
  }
  // Allow exact match or any subdomain of PLATFORM_DOMAIN.
  return host === platformDomain || host.endsWith(`.${platformDomain}`);
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── Register ──────────────────────────────────────────────────────────────
  fastify.post("/api/v1/auth/register", {
    schema: {
      body: RegisterBody,
    },
    // S4 — Aggressively cap registration: account creation is unauthenticated
    // and abusable for resource exhaustion / spam.
    config: {
      rateLimit: {
        max: 3,
        timeWindow: "1 hour",
      },
    },
    handler: async (request, reply) => {
      const { email, password, name } = request.body as z.infer<typeof RegisterBody>;

      // Check email uniqueness
      const [existing] = await fastify.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existing) {
        const err = new Error("Email already registered") as Error & { statusCode: number };
        err.statusCode = 409;
        throw err;
      }

      const now = new Date().toISOString();
      const userId = ulid();
      const hashedPassword = await bcrypt.hash(password, 12);

      await fastify.db.insert(users).values({
        id: userId,
        email,
        password: hashedPassword,
        name,
        role: "member",
        createdAt: now,
        updatedAt: now,
      });

      // Generate tokens
      const accessToken = fastify.jwt.sign(
        { sub: userId, email, role: "member" },
        { expiresIn: "15m" },
      );
      const refreshToken = signRefreshToken(fastify, userId, 0);

      void reply.setCookie("refresh_token", refreshToken, COOKIE_OPTIONS);

      return reply.status(201).send(
        success({
          user: { id: userId, email, name, role: "member" },
          accessToken,
        }),
      );
    },
  });

  // ─── Login ─────────────────────────────────────────────────────────────────
  fastify.post("/api/v1/auth/login", {
    schema: {
      body: LoginBody,
    },
    config: {
      rateLimit: {
        max: 5,
        timeWindow: "15 minutes",
      },
    },
    handler: async (request, reply) => {
      const { email, password } = request.body as z.infer<typeof LoginBody>;

      // Raw SQL so we always see the SEC-owned columns
      // (failed_login_attempts, locked_until, token_version) regardless of
      // whether this worktree's Drizzle schema reflects them yet.
      const loginUserRows = fastify.db.all(
        sql`SELECT id, email, password, name, role,
                   failed_login_attempts AS "failedLoginAttempts",
                   locked_until AS "lockedUntil",
                   token_version AS "tokenVersion"
            FROM users WHERE email = ${email} LIMIT 1`,
      ) as UserRow[];
      const [user] = loginUserRows;

      if (!user) {
        const err = new Error("Invalid credentials") as Error & { statusCode: number };
        err.statusCode = 401;
        throw err;
      }

      // S2 — Reject before bcrypt if the account is locked. Always 401 with
      // a distinct message so legitimate users know to wait; this does
      // expose account existence, but the lockout itself is the signal —
      // an unlocked account still returns generic "Invalid credentials".
      const lockedUntil = user.lockedUntil;
      if (lockedUntil) {
        const lockedUntilMs = Date.parse(lockedUntil);
        if (Number.isFinite(lockedUntilMs) && lockedUntilMs > Date.now()) {
          const err = new Error("Account temporarily locked") as Error & {
            statusCode: number;
          };
          err.statusCode = 401;
          throw err;
        }
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        const attempts = (user.failedLoginAttempts ?? 0) + 1;
        // Raw SQL because the columns are owned by the DB stream and not yet
        // reflected in @deployx/db's Drizzle schema in this worktree. The
        // production migration and test DDL both create snake_case columns.
        const lockedUntil =
          attempts >= MAX_FAILED_LOGINS
            ? new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString()
            : null;
        fastify.db.run(
          sql`UPDATE users SET failed_login_attempts = ${attempts}, locked_until = ${lockedUntil} WHERE id = ${user.id}`,
        );

        const err = new Error("Invalid credentials") as Error & { statusCode: number };
        err.statusCode = 401;
        throw err;
      }

      // Successful login — clear the lockout counter.
      if ((user.failedLoginAttempts ?? 0) > 0 || user.lockedUntil) {
        fastify.db.run(
          sql`UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ${user.id}`,
        );
      }

      const tokenVersion = user.tokenVersion ?? 0;
      const accessToken = fastify.jwt.sign(
        { sub: user.id, email: user.email, role: user.role },
        { expiresIn: "15m" },
      );
      const refreshToken = signRefreshToken(fastify, user.id, tokenVersion);

      void reply.setCookie("refresh_token", refreshToken, COOKIE_OPTIONS);

      return reply.send(
        success({
          user: { id: user.id, email: user.email, name: user.name, role: user.role },
          accessToken,
        }),
      );
    },
  });

  // ─── Refresh ───────────────────────────────────────────────────────────────
  fastify.post("/api/v1/auth/refresh", {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: "1 minute",
      },
    },
    handler: async (request, reply) => {
      // S6 — Origin pinning. Cookie is SameSite=Strict but this is the last
      // line of defense against CSRF if the SameSite contract ever changes
      // (e.g. cross-site iframes on legacy browsers).
      if (!isOriginAllowed(request)) {
        const err = new Error("Origin not allowed") as Error & { statusCode: number };
        err.statusCode = 403;
        throw err;
      }

      const token = request.cookies["refresh_token"];

      if (!token) {
        const err = new Error("No refresh token provided") as Error & { statusCode: number };
        err.statusCode = 401;
        throw err;
      }

      let payload: RefreshClaim;
      try {
        payload = fastify.jwt.verify<RefreshClaim>(token);
      } catch {
        const err = new Error("Invalid or expired refresh token") as Error & { statusCode: number };
        err.statusCode = 401;
        throw err;
      }

      if (payload.type !== "refresh") {
        const err = new Error("Invalid token type") as Error & { statusCode: number };
        err.statusCode = 401;
        throw err;
      }

      const refreshUserRows = fastify.db.all(
        sql`SELECT id, email, password, name, role,
                   failed_login_attempts AS "failedLoginAttempts",
                   locked_until AS "lockedUntil",
                   token_version AS "tokenVersion"
            FROM users WHERE id = ${payload.sub} LIMIT 1`,
      ) as UserRow[];
      const [user] = refreshUserRows;

      if (!user) {
        const err = new Error("User not found") as Error & { statusCode: number };
        err.statusCode = 401;
        throw err;
      }

      // S3 — Reject if the token's ver claim does not match the user's
      // current tokenVersion. Logout bumps tokenVersion so all outstanding
      // refresh tokens for that user are instantly revoked.
      const currentVersion = user.tokenVersion ?? 0;
      const tokenVer = payload.ver ?? 0;
      if (tokenVer !== currentVersion) {
        const err = new Error("Refresh token revoked") as Error & {
          statusCode: number;
        };
        err.statusCode = 401;
        throw err;
      }

      // Rotate tokens
      const accessToken = fastify.jwt.sign(
        { sub: user.id, email: user.email, role: user.role },
        { expiresIn: "15m" },
      );
      const refreshToken = signRefreshToken(fastify, user.id, currentVersion);

      void reply.setCookie("refresh_token", refreshToken, COOKIE_OPTIONS);

      return reply.send(
        success({
          accessToken,
        }),
      );
    },
  });

  // ─── Logout ────────────────────────────────────────────────────────────────
  fastify.post("/api/v1/auth/logout", async (request, reply) => {
    // S3 — Best-effort token-version bump so any outstanding refresh tokens
    // for this user are immediately invalidated. We read the user from the
    // refresh cookie (no access token required on logout). Failures are
    // swallowed — clients calling /logout when already unauthenticated
    // should still get a 200 with cleared cookie.
    const token = request.cookies["refresh_token"];
    if (token) {
      try {
        const payload = fastify.jwt.verify<RefreshClaim>(token);
        if (payload.sub && payload.type === "refresh") {
          const logoutUserRows = fastify.db.all(
            sql`SELECT id, token_version AS "tokenVersion"
                FROM users WHERE id = ${payload.sub} LIMIT 1`,
          ) as Array<{ id: string; tokenVersion: number | null }>;
          const [user] = logoutUserRows;
          if (user) {
            const nextVersion = (user.tokenVersion ?? 0) + 1;
            fastify.db.run(
              sql`UPDATE users SET token_version = ${nextVersion} WHERE id = ${user.id}`,
            );
          }
        }
      } catch {
        // Invalid/expired refresh token — nothing to revoke.
      }
    }

    void reply.clearCookie("refresh_token", { path: "/api/v1/auth" });

    return reply.send(
      success({ message: "Logged out" }),
    );
  });
}
