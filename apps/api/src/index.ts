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

import { errorHandlerPlugin } from "./plugins/error-handler.js";
import { authPlugin } from "./plugins/auth.js";
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

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
