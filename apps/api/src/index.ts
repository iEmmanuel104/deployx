// Load .env in dev. In production the systemd unit sources /etc/deployx/.env
// before launching node, so this is a no-op when env vars are already set.
import "dotenv/config";

import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { ulid } from "ulidx";

import { createDb, probeDb } from "@deployx/db";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { errorHandlerPlugin } from "./plugins/error-handler.js";
import { authPlugin } from "./plugins/auth.js";
import { queueProcessorPlugin } from "./queue/plugin.js";
import { authRoutes } from "./routes/auth.js";
import { projectRoutes } from "./routes/projects.js";
import { deploymentRoutes } from "./routes/deployments.js";
import { domainRoutes } from "./routes/domains.js";
import { envVarRoutes } from "./routes/env-vars.js";
import { metricRoutes } from "./routes/metrics.js";
import { systemRoutes } from "./routes/system.js";

const PORT = Number(process.env["PORT"] ?? 3001);
const HOST = "0.0.0.0";

// S1 — Fail-fast on insecure secrets. We refuse to start with either secret
// missing or set to the documented placeholder; running with a known-default
// secret in production would let anyone mint valid JWTs / decrypt env vars.
// Skipped under NODE_ENV=test so the in-memory test harness can set its own.
function assertProductionSecrets(): void {
  if (process.env["NODE_ENV"] === "test") return;
  const jwtSecret = process.env["JWT_SECRET"];
  if (!jwtSecret || jwtSecret === "change-me-in-production") {
    console.error(
      "[fatal] JWT_SECRET is missing or set to the default placeholder. " +
        "Generate a strong secret (e.g. `openssl rand -hex 32`) and set it " +
        "in /etc/deployx/.env before starting.",
    );
    process.exit(1);
  }
  const encKey = process.env["ENCRYPTION_KEY"];
  if (!encKey || encKey === "change-me-in-production") {
    console.error(
      "[fatal] ENCRYPTION_KEY is missing or set to the default placeholder. " +
        "Generate a 32-byte hex key (e.g. `openssl rand -hex 32`) and set it " +
        "in /etc/deployx/.env before starting.",
    );
    process.exit(1);
  }
}

assertProductionSecrets();

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env["LOG_LEVEL"] ?? "info",
    },
    // S7 — Use ULIDs for request IDs so logs / error envelopes carry a
    // lexicographically sortable, globally unique identifier.
    genReqId: () => ulid(),
  });

  // Zod type provider
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // S7 — Bind request.id on every request as a defense-in-depth in case any
  // upstream code overwrites the generator. Also surfaced via x-request-id.
  app.addHook("onRequest", async (request, reply) => {
    if (!request.id || /^req-\d/.test(request.id)) {
      (request as { id: string }).id = ulid();
    }
    void reply.header("x-request-id", request.id);
  });

  // --- plugins ---
  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);
  await app.register(jwt, {
    secret: process.env["JWT_SECRET"] ?? "change-me-in-production",
  });
  // Rate limit is per-IP by default. When DeployX runs behind Traefik all
  // requests appear to come from the proxy IP, so a low global cap (100/min)
  // breaks even single-user usage. We honor X-Forwarded-For and use a
  // generous default. Setting RATE_LIMIT_DISABLED=1 turns it off entirely —
  // useful for local dev and CI runs hitting auth endpoints repeatedly.
  // Override via RATE_LIMIT_MAX / RATE_LIMIT_WINDOW.
  const rateLimitDisabled = process.env["RATE_LIMIT_DISABLED"] === "1";
  await app.register(rateLimit, {
    max: Number(process.env["RATE_LIMIT_MAX"] ?? 1000),
    timeWindow: process.env["RATE_LIMIT_WINDOW"] ?? "1 minute",
    skipOnError: true,
    // allowList bypasses BOTH global and per-route limits — used in dev/CI to
    // avoid the 5-logins-per-15-min on auth endpoints from blocking flows.
    allowList: rateLimitDisabled ? () => true : undefined,
    keyGenerator: (req) => {
      const xff = req.headers["x-forwarded-for"];
      if (typeof xff === "string" && xff.length > 0) {
        return xff.split(",")[0]!.trim();
      }
      return req.ip;
    },
  });
  await app.register(websocket);

  // custom plugins
  await app.register(errorHandlerPlugin);
  await app.register(authPlugin);

  // --- database ---
  const db = createDb(process.env["DB_PATH"] ?? "./data/platform.db");
  app.decorate("db", db);

  // Auto-run migrations on startup
  try {
    const possiblePaths = [
      new URL("../../packages/db/drizzle", import.meta.url).pathname,
      "/app/packages/db/drizzle",  // Docker container path
      "./packages/db/drizzle",     // Relative from CWD
    ];
    let migrated = false;
    for (const migrationsPath of possiblePaths) {
      try {
        migrate(db, { migrationsFolder: migrationsPath });
        app.log.info({ path: migrationsPath }, "Database migrations applied");
        migrated = true;
        break;
      } catch {
        continue;
      }
    }
    if (!migrated) {
      app.log.warn("Could not find migrations folder — tables may need manual creation");
    }
  } catch (err) {
    app.log.warn({ err }, "Migration warning");
  }

  // --- health endpoints ---
  app.get("/healthz", async (_req, reply) => {
    return reply.send({
      status: "ok",
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      ts: new Date().toISOString(),
    });
  });

  app.get("/readyz", async (_req, reply) => {
    const probe = probeDb(db);
    if (!probe.ok) {
      app.log.error({ detail: probe.detail }, "/readyz DB probe failed");
      return reply.status(503).send({ status: "db_unreachable", detail: probe.detail });
    }
    return reply.send({ status: "ok", db: "ok" });
  });

  // --- routes ---
  await app.register(authRoutes);
  await app.register(projectRoutes);
  await app.register(deploymentRoutes);
  await app.register(domainRoutes);
  await app.register(envVarRoutes);
  await app.register(metricRoutes);
  await app.register(systemRoutes);

  // --- job queue ---
  await app.register(queueProcessorPlugin, {
    db,
    pollIntervalMs: Number(process.env["QUEUE_POLL_MS"] ?? 2000),
  });

  return app;
}

async function main() {
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down gracefully…`);
    await app.close();
    app.log.info("Server closed. Clean exit.");
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ host: HOST, port: PORT });
  app.log.info(`DeployX API listening on http://${HOST}:${PORT}`);
}

// Only start the server when this file is executed directly (not imported in tests).
// In ESM, compare import.meta.url to the resolved argv[1] to detect direct execution.
import { pathToFileURL } from "node:url";

const entryUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;

if (entryUrl === import.meta.url) {
  main().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}
