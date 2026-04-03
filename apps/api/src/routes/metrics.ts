import type { FastifyInstance } from "fastify";
import { z } from "zod";

const ProjectIdParam = z.object({
  projectId: z.string().uuid(),
});

const MetricsQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  interval: z.enum(["1m", "5m", "15m", "1h", "6h", "1d"]).optional(),
});

const stub = { ok: true as const, data: { message: "Not implemented" } };

export async function metricRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/v1/projects/:projectId/metrics", {
    schema: { params: ProjectIdParam, querystring: MetricsQuery },
    handler: async (_request, reply) => {
      return reply.send(stub);
    },
  });
}
