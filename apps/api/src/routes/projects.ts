import type { FastifyInstance } from "fastify";
import { z } from "zod";

const CreateProjectBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  source_type: z.enum(["git", "upload"]),
  git_repo: z.string().url().optional(),
  git_branch: z.string().optional(),
  build_type: z.enum(["dockerfile", "buildpack", "nixpack", "static"]),
  port: z.number().int().min(1).max(65535).optional(),
});

const UpdateProjectBody = z.object({
  name: z.string().min(1).optional(),
  git_repo: z.string().url().optional(),
  git_branch: z.string().optional(),
  build_type: z.enum(["dockerfile", "buildpack", "nixpack", "static"]).optional(),
  port: z.number().int().min(1).max(65535).optional(),
});

const IdParam = z.object({
  id: z.string().uuid(),
});

const stub = { ok: true as const, data: { message: "Not implemented" } };

export async function projectRoutes(fastify: FastifyInstance): Promise<void> {
  // List projects
  fastify.get("/api/v1/projects", async (_request, reply) => {
    return reply.send(stub);
  });

  // Create project
  fastify.post("/api/v1/projects", {
    schema: { body: CreateProjectBody },
    handler: async (_request, reply) => {
      return reply.status(201).send(stub);
    },
  });

  // Get project
  fastify.get("/api/v1/projects/:id", {
    schema: { params: IdParam },
    handler: async (_request, reply) => {
      return reply.send(stub);
    },
  });

  // Update project
  fastify.patch("/api/v1/projects/:id", {
    schema: { params: IdParam, body: UpdateProjectBody },
    handler: async (_request, reply) => {
      return reply.send(stub);
    },
  });

  // Soft-delete project
  fastify.delete("/api/v1/projects/:id", {
    schema: { params: IdParam },
    handler: async (_request, reply) => {
      return reply.send(stub);
    },
  });

  // Trigger deploy
  fastify.post("/api/v1/projects/:id/deploy", {
    schema: { params: IdParam },
    handler: async (_request, reply) => {
      return reply.send(stub);
    },
  });

  // Stop project
  fastify.post("/api/v1/projects/:id/stop", {
    schema: { params: IdParam },
    handler: async (_request, reply) => {
      return reply.send(stub);
    },
  });

  // Restart project
  fastify.post("/api/v1/projects/:id/restart", {
    schema: { params: IdParam },
    handler: async (_request, reply) => {
      return reply.send(stub);
    },
  });
}
