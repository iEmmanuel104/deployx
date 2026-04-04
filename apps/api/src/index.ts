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

import { createDb } from "@deployx/db";
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

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env["LOG_LEVEL"] ?? "info",
    },
  });

  // Zod type provider
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // --- plugins ---
  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);
  await app.register(jwt, {
    secret: process.env["JWT_SECRET"] ?? "change-me-in-production",
  });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  await app.register(websocket);

  // custom plugins
  await app.register(errorHandlerPlugin);
  await app.register(authPlugin);

  // --- database ---
  const db = createDb(process.env["DB_PATH"] ?? "./data/platform.db");
  app.decorate("db", db);

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
    // TODO: check DB connection, etc.
    return reply.send({ status: "ok" });
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
