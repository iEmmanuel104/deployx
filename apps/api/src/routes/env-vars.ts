import type { FastifyInstance } from "fastify";
import { z } from "zod";

const ProjectIdParam = z.object({
  projectId: z.string().uuid(),
});

const EnvKeyParam = z.object({
  projectId: z.string().uuid(),
  key: z.string().min(1),
});

const SetEnvBody = z.object({
  key: z.string().min(1).regex(/^[A-Z_][A-Z0-9_]*$/i),
  value: z.string(),
  is_build: z.boolean().default(false),
});

const stub = { ok: true as const, data: { message: "Not implemented" } };

export async function envVarRoutes(fastify: FastifyInstance): Promise<void> {
  // List env vars (keys only, no values)
  fastify.get("/api/v1/projects/:projectId/env", {
    schema: { params: ProjectIdParam },
    handler: async (_request, reply) => {
      return reply.send(stub);
    },
  });

  // Set env var
  fastify.post("/api/v1/projects/:projectId/env", {
    schema: { params: ProjectIdParam, body: SetEnvBody },
    handler: async (_request, reply) => {
      return reply.status(201).send(stub);
    },
  });

  // Delete env var
  fastify.delete("/api/v1/projects/:projectId/env/:key", {
    schema: { params: EnvKeyParam },
    handler: async (_request, reply) => {
      return reply.send(stub);
    },
  });
}
