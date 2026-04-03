import type { FastifyInstance } from "fastify";
import os from "node:os";

export async function systemRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/v1/system/info", async (_request, reply) => {
    return reply.send({
      ok: true,
      data: {
        version: "0.1.0",
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        uptime: process.uptime(),
        hostname: os.hostname(),
        cpus: os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
      },
    });
  });
}
