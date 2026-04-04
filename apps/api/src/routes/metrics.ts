import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, gte, lte, asc } from "drizzle-orm";
import { metrics } from "@deployx/db";
import { requireAuth } from "../plugins/auth.js";
import { getOwnedProject } from "../utils/ownership.js";
import { success } from "../utils/response.js";

const ProjectIdParam = z.object({
  projectId: z.string().min(1),
});

const MetricsQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  interval: z.enum(["1m", "5m", "15m", "1h", "6h", "1d"]).optional(),
});

export async function metricRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/v1/projects/:projectId/metrics", {
    schema: { params: ProjectIdParam, querystring: MetricsQuery },
    onRequest: requireAuth,
    handler: async (request, reply) => {
      const { projectId } = request.params as z.infer<typeof ProjectIdParam>;
      const query = request.query as z.infer<typeof MetricsQuery>;
      const userId = request.user.sub;

      await getOwnedProject(fastify.db, userId, projectId);

      const conditions = [eq(metrics.projectId, projectId)];

      if (query.from) {
        conditions.push(gte(metrics.ts, query.from));
      }

      if (query.to) {
        conditions.push(lte(metrics.ts, query.to));
      }

      const rows = await fastify.db
        .select()
        .from(metrics)
        .where(and(...conditions))
        .orderBy(asc(metrics.ts));

      return reply.send(success(rows));
    },
  });
}
