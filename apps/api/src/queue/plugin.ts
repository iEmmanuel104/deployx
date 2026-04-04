import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { QueueProcessor } from "./processor.js";
import { jobHandlers } from "./handlers/index.js";
import type { DeployxDb } from "@deployx/db";

declare module "fastify" {
  interface FastifyInstance {
    queueProcessor: QueueProcessor;
  }
}

interface QueuePluginOpts {
  db: DeployxDb;
  pollIntervalMs?: number;
}

function queuePlugin(
  fastify: FastifyInstance,
  opts: QueuePluginOpts,
): void {
  const processor = new QueueProcessor({
    db: opts.db,
    logger: fastify.log,
    pollIntervalMs: opts.pollIntervalMs ?? 2000,
    handlers: jobHandlers,
  });

  fastify.decorate("queueProcessor", processor);

  fastify.addHook("onReady", () => {
    processor.start();
  });

  fastify.addHook("onClose", async () => {
    await processor.stop();
  });
}

export const queueProcessorPlugin = fp(queuePlugin, {
  name: "queue-processor",
});
