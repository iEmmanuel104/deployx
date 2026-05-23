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

const MAX_WINDOW_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const RESULT_LIMIT = 100000;

export async function metricRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/v1/projects/:projectId/metrics", {
    schema: { params: ProjectIdParam, querystring: MetricsQuery },
    onRequest: requireAuth,
    handler: async (request, reply) => {
      const { projectId } = request.params as z.infer<typeof ProjectIdParam>;
      const query = request.query as z.infer<typeof MetricsQuery>;
      const userId = request.user.sub;

      await getOwnedProject(fastify.db, userId, projectId);

      // A3: reject from > to
      if (query.from && query.to) {
        if (new Date(query.from).getTime() > new Date(query.to).getTime()) {
          const err = new Error(
            "`from` must be earlier than or equal to `to`",
          ) as Error & { statusCode: number };
          err.statusCode = 400;
          throw err;
        }
      }

      // A3: clamp `from` to last 90 days (default to 90d ago if missing)
      const now = Date.now();
      const cutoff = new Date(now - MAX_WINDOW_MS).toISOString();
      let effectiveFrom = query.from ?? cutoff;
      if (new Date(effectiveFrom).getTime() < now - MAX_WINDOW_MS) {
        effectiveFrom = cutoff;
      }

      const conditions = [
        eq(metrics.projectId, projectId),
        gte(metrics.ts, effectiveFrom),
      ];

      if (query.to) {
        conditions.push(lte(metrics.ts, query.to));
      }

      const rows = await fastify.db
        .select()
        .from(metrics)
        .where(and(...conditions))
        .orderBy(asc(metrics.ts))
        .limit(RESULT_LIMIT);

      return reply.send(success(rows));
    },
  });
}
