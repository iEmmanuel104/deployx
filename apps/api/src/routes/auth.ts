import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { ulid } from "ulidx";
import bcrypt from "bcryptjs";
import { users } from "@deployx/db";
import { success } from "../utils/response.js";

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

/** Sign a refresh token (different payload shape from access tokens). */
function signRefreshToken(fastify: FastifyInstance, userId: string): string {
  // Refresh tokens intentionally carry a different payload than access tokens,
  // so we bypass the typed FastifyJWT overload.
  const sign = fastify.jwt.sign as unknown as (
    payload: Record<string, unknown>,
    opts: { expiresIn: string },
  ) => string;
  return sign({ sub: userId, type: "refresh" }, { expiresIn: "7d" });
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── Register ──────────────────────────────────────────────────────────────
  fastify.post("/api/v1/auth/register", {
    schema: {
      body: RegisterBody,
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
      const refreshToken = signRefreshToken(fastify, userId);

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

      const [user] = await fastify.db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!user) {
        const err = new Error("Invalid credentials") as Error & { statusCode: number };
        err.statusCode = 401;
        throw err;
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        const err = new Error("Invalid credentials") as Error & { statusCode: number };
        err.statusCode = 401;
        throw err;
      }

      const accessToken = fastify.jwt.sign(
        { sub: user.id, email: user.email, role: user.role },
        { expiresIn: "15m" },
      );
      const refreshToken = signRefreshToken(fastify, user.id);

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
      const token = request.cookies["refresh_token"];

      if (!token) {
        const err = new Error("No refresh token provided") as Error & { statusCode: number };
        err.statusCode = 401;
        throw err;
      }

      let payload: { sub: string; type?: string };
      try {
        payload = fastify.jwt.verify<{ sub: string; type?: string }>(token);
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

      const [user] = await fastify.db
        .select()
        .from(users)
        .where(eq(users.id, payload.sub))
        .limit(1);

      if (!user) {
        const err = new Error("User not found") as Error & { statusCode: number };
        err.statusCode = 401;
        throw err;
      }

      // Rotate tokens
      const accessToken = fastify.jwt.sign(
        { sub: user.id, email: user.email, role: user.role },
        { expiresIn: "15m" },
      );
      const refreshToken = signRefreshToken(fastify, user.id);

      void reply.setCookie("refresh_token", refreshToken, COOKIE_OPTIONS);

      return reply.send(
        success({
          accessToken,
        }),
      );
    },
  });

  // ─── Logout ────────────────────────────────────────────────────────────────
  fastify.post("/api/v1/auth/logout", async (_request, reply) => {
    void reply.clearCookie("refresh_token", { path: "/api/v1/auth" });

    return reply.send(
      success({ message: "Logged out" }),
    );
  });
}
