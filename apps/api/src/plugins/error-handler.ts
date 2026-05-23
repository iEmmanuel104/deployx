import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { ZodError } from "zod";

interface ApiErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

function buildErrorEnvelope(
  code: string,
  message: string,
  requestId: string | undefined,
  details?: unknown,
): ApiErrorEnvelope {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(details !== undefined && { details }),
      ...(requestId !== undefined && { requestId }),
    },
  };
}

// S5 — Keys that may carry credentials and must never be logged.
// Matched case-insensitively against any property name at any nesting depth.
const REDACTED_KEYS = new Set([
  "authorization",
  "cookie",
  "password",
  "accesstoken",
  "refreshtoken",
  "token",
]);

const REDACTED_VALUE = "[redacted]";

/**
 * Deep-clones an error/object graph, replacing any property whose key matches
 * REDACTED_KEYS (case-insensitive) with "[redacted]". Cycles are tracked so
 * the helper is safe for arbitrary error objects (which often share refs).
 */
export function redactSensitive(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (seen.has(value as object)) return "[circular]";
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((v) => redactSensitive(v, seen));
  }

  // Preserve Error shape — Fastify's logger pretty-prints err.message/stack,
  // so we surface those explicitly after redacting the rest of the keys.
  const isError = value instanceof Error;
  const out: Record<string, unknown> = {};
  if (isError) {
    out["name"] = value.name;
    out["message"] = value.message;
    if (value.stack) out["stack"] = value.stack;
  }

  for (const key of Object.keys(value as object)) {
    const lower = key.toLowerCase();
    if (REDACTED_KEYS.has(lower)) {
      out[key] = REDACTED_VALUE;
      continue;
    }
    const child = (value as Record<string, unknown>)[key];
    out[key] = redactSensitive(child, seen);
  }
  return out;
}

async function errorHandler(fastify: FastifyInstance): Promise<void> {
  fastify.setErrorHandler(
    (
      error: Error & { statusCode?: number; validation?: unknown },
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      // S5 — Redact secrets before they hit the log stream.
      fastify.log.error({ err: redactSensitive(error), reqId: request.id });

      const requestId = request.id;

      // Zod validation errors
      if (error instanceof ZodError) {
        return reply.status(400).send(
          buildErrorEnvelope(
            "VALIDATION_ERROR",
            "Request validation failed",
            requestId,
            error.flatten(),
          ),
        );
      }

      // Fastify schema validation errors
      if (error.validation) {
        return reply.status(400).send(
          buildErrorEnvelope(
            "VALIDATION_ERROR",
            error.message,
            requestId,
            error.validation,
          ),
        );
      }

      // Known HTTP errors
      const statusCode = error.statusCode;
      if (statusCode && statusCode >= 400 && statusCode < 500) {
        return reply.status(statusCode).send(
          buildErrorEnvelope(
            `HTTP_${statusCode}`,
            error.message,
            requestId,
          ),
        );
      }

      // Unknown / 500 errors
      return reply.status(500).send(
        buildErrorEnvelope(
          "INTERNAL_SERVER_ERROR",
          "An unexpected error occurred",
          requestId,
        ),
      );
    },
  );
}

export const errorHandlerPlugin = fp(errorHandler, {
  name: "error-handler",
});
