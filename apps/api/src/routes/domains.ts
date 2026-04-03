import type { FastifyInstance } from "fastify";
import { z } from "zod";

const ProjectIdParam = z.object({
  projectId: z.string().uuid(),
});

const DomainParams = z.object({
  projectId: z.string().uuid(),
  id: z.string().uuid(),
});

const AddDomainBody = z.object({
  domain: z.string().min(1),
});

const stub = { ok: true as const, data: { message: "Not implemented" } };

export async function domainRoutes(fastify: FastifyInstance): Promise<void> {
  // List domains
  fastify.get("/api/v1/projects/:projectId/domains", {
    schema: { params: ProjectIdParam },
    handler: async (_request, reply) => {
      return reply.send(stub);
    },
  });

  // Add domain
  fastify.post("/api/v1/projects/:projectId/domains", {
    schema: { params: ProjectIdParam, body: AddDomainBody },
    handler: async (_request, reply) => {
      return reply.status(201).send(stub);
    },
  });

  // Remove domain
  fastify.delete("/api/v1/projects/:projectId/domains/:id", {
    schema: { params: DomainParams },
    handler: async (_request, reply) => {
      return reply.send(stub);
    },
  });
}
