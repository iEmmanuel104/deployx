import type { FastifyInstance } from "fastify";
import os from "node:os";
import { z } from "zod";
import { gcBuilds } from "@deployx/builder";
import { requireAuth } from "../plugins/auth.js";

const GcQuerySchema = z.object({
  keep: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? 5 : Number(v)))
    .pipe(z.number().int().min(0).max(100)),
  dryRun: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

export async function systemRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/v1/system/info", {
    onRequest: requireAuth,
    handler: async (_request, reply) => {
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
    },
  });

  fastify.post("/api/v1/system/gc", {
    onRequest: requireAuth,
    schema: {
      querystring: GcQuerySchema,
    },
    handler: async (request, reply) => {
      const { keep, dryRun } = request.query as z.infer<typeof GcQuerySchema>;
      const result = await gcBuilds({ keepPerProject: keep, dryRun });
      return reply.send({ ok: true, data: result });
    },
  });
}
