import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ulid } from "ulidx";
import { apiTokens } from "@deployx/db";
import { requireAuth } from "../plugins/auth.js";
import { success } from "../utils/response.js";

const CreateTokenBody = z.object({
  name: z.string().min(1).max(64),
  expiresAt: z.string().datetime().optional(),
});

const IdParam = z.object({ id: z.string().min(1) });

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Generate an API token of the form `dxat_<ulid>_<secret>`.
 * Only the SHA-256 hash of the full token is stored — the plain token is
 * returned to the caller exactly once on creation.
 */
function generateToken(): { id: string; token: string; hash: string } {
  const id = ulid();
  const secret = crypto.randomBytes(32).toString("base64url");
  const token = `dxat_${id}_${secret}`;
  return { id, token, hash: sha256(token) };
}

export async function apiTokenRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── Create token ──────────────────────────────────────────────────────────
  fastify.post("/api/v1/api-tokens", {
    schema: { body: CreateTokenBody },
    onRequest: requireAuth,
    handler: async (request, reply) => {
      const body = request.body as z.infer<typeof CreateTokenBody>;
      const userId = request.user.sub;
      const now = new Date().toISOString();

      const { id, token, hash } = generateToken();

      await fastify.db.insert(apiTokens).values({
        id,
        userId,
        name: body.name,
        tokenHash: hash,
        lastUsedAt: null,
        expiresAt: body.expiresAt ?? null,
        createdAt: now,
      });

      // Token is returned ONCE — the plain string never lives in the DB.
      return reply.status(201).send(
        success({
          id,
          name: body.name,
          token,
          expiresAt: body.expiresAt ?? null,
          createdAt: now,
        }),
      );
    },
  });

  // ─── List tokens (no secret material) ──────────────────────────────────────
  fastify.get("/api/v1/api-tokens", {
    onRequest: requireAuth,
    handler: async (request, reply) => {
      const userId = request.user.sub;

      const rows = await fastify.db
        .select({
          id: apiTokens.id,
          name: apiTokens.name,
          lastUsedAt: apiTokens.lastUsedAt,
          expiresAt: apiTokens.expiresAt,
          createdAt: apiTokens.createdAt,
        })
        .from(apiTokens)
        .where(eq(apiTokens.userId, userId));

      return reply.send(success(rows));
    },
  });

  // ─── Revoke token ──────────────────────────────────────────────────────────
  fastify.delete("/api/v1/api-tokens/:id", {
    schema: { params: IdParam },
    onRequest: requireAuth,
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof IdParam>;
      const userId = request.user.sub;

      const [existing] = await fastify.db
        .select({ id: apiTokens.id })
        .from(apiTokens)
        .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)))
        .limit(1);

      if (!existing) {
        const err = new Error("API token not found") as Error & {
          statusCode: number;
        };
        err.statusCode = 404;
        throw err;
      }

      await fastify.db.delete(apiTokens).where(eq(apiTokens.id, id));

      return reply.send(success({ id, revoked: true }));
    },
  });
}
