import type { FastifyInstance } from "fastify";
import { z } from "zod";

const ProjectIdParam = z.object({
  projectId: z.string().uuid(),
});

const DeploymentParams = z.object({
  projectId: z.string().uuid(),
  id: z.string().uuid(),
});

const stub = { ok: true as const, data: { message: "Not implemented" } };

export async function deploymentRoutes(fastify: FastifyInstance): Promise<void> {
  // List deployments
  fastify.get("/api/v1/projects/:projectId/deployments", {
    schema: { params: ProjectIdParam },
    handler: async (_request, reply) => {
      return reply.send(stub);
    },
  });

  // Get deployment
  fastify.get("/api/v1/projects/:projectId/deployments/:id", {
    schema: { params: DeploymentParams },
    handler: async (_request, reply) => {
      return reply.send(stub);
    },
  });

  // Rollback deployment
  fastify.post("/api/v1/projects/:projectId/deployments/:id/rollback", {
    schema: { params: DeploymentParams },
    handler: async (_request, reply) => {
      return reply.send(stub);
    },
  });
}
