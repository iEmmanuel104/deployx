import crypto from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { DeployxDb } from "@deployx/db";
import { idempotencyKeys } from "@deployx/db";

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_KEY_LENGTH = 255;

export function hashRequest(method: string, path: string, body: unknown): string {
  const bodyStr = body === undefined || body === null ? "" : JSON.stringify(body);
  return crypto
    .createHash("sha256")
    .update(`${method.toUpperCase()}\n${path}\n${bodyStr}`)
    .digest("hex");
}

export interface CachedResponse {
  statusCode: number;
  body: unknown;
}

/**
 * Look up a cached idempotent response for (userId, key).
 * - Returns the cached response if the same key + hash is found within TTL.
 * - Throws 422 if the key exists but with a different request hash (conflict).
 * - Returns null if no record exists (caller should proceed and store).
 */
export async function lookupIdempotent(
  db: DeployxDb,
  userId: string,
  key: string,
  requestHash: string,
): Promise<CachedResponse | null> {
  if (key.length > MAX_KEY_LENGTH) {
    const err = new Error(
      `Idempotency-Key too long (max ${MAX_KEY_LENGTH} chars)`,
    ) as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  const [row] = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key)))
    .limit(1);

  if (!row) return null;

  const ageMs = Date.now() - new Date(row.createdAt).getTime();
  if (ageMs > TTL_MS) {
    // Stale — remove and treat as missing
    await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, row.key));
    return null;
  }

  if (row.responseHash !== requestHash) {
    const err = new Error(
      "Idempotency-Key reused with a different request payload",
    ) as Error & { statusCode: number };
    err.statusCode = 422;
    throw err;
  }

  return {
    statusCode: row.statusCode,
    body: JSON.parse(row.body),
  };
}

export async function storeIdempotent(
  db: DeployxDb,
  opts: {
    key: string;
    userId: string;
    requestHash: string;
    statusCode: number;
    body: unknown;
  },
): Promise<void> {
  await db.insert(idempotencyKeys).values({
    key: opts.key,
    userId: opts.userId,
    responseHash: opts.requestHash,
    statusCode: opts.statusCode,
    body: JSON.stringify(opts.body),
    createdAt: new Date().toISOString(),
  });
}

/**
 * Best-effort cleanup of expired idempotency rows. Safe to call from any
 * request handler — does not throw on failure.
 */
export async function cleanupExpiredIdempotent(db: DeployxDb): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - TTL_MS).toISOString();
    await db.delete(idempotencyKeys).where(lt(idempotencyKeys.createdAt, cutoff));
  } catch {
    // best-effort
  }
}

/**
 * Wrap an unsafe POST handler so it honours the `Idempotency-Key` header.
 * If the header is absent the handler runs normally and the response is not cached.
 *
 * The wrapped handler must return its full response body — sending via reply is
 * handled by this helper so the cache captures the exact status + body.
 */
export async function withIdempotency<T>(
  db: DeployxDb,
  request: FastifyRequest,
  reply: FastifyReply,
  produce: () => Promise<{ statusCode: number; body: T }>,
): Promise<unknown> {
  const headerVal = request.headers["idempotency-key"];
  const key = Array.isArray(headerVal) ? headerVal[0] : headerVal;

  if (!key || key.length === 0) {
    const { statusCode, body } = await produce();
    return reply.status(statusCode).send(body);
  }

  const userId = request.user.sub;
  const requestHash = hashRequest(request.method, request.url, request.body);

  const cached = await lookupIdempotent(db, userId, key, requestHash);
  if (cached) {
    return reply.status(cached.statusCode).send(cached.body);
  }

  const { statusCode, body } = await produce();

  try {
    await storeIdempotent(db, { key, userId, requestHash, statusCode, body });
  } catch (err) {
    // If a concurrent request inserted first, re-check and return the cached one.
    const recheck = await lookupIdempotent(db, userId, key, requestHash);
    if (recheck) {
      return reply.status(recheck.statusCode).send(recheck.body);
    }
    throw err;
  }

  // Fire-and-forget cleanup of stale rows.
  void cleanupExpiredIdempotent(db);

  return reply.status(statusCode).send(body);
}
