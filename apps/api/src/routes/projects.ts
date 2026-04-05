import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, isNull, desc } from "drizzle-orm";
import { ulid } from "ulidx";
import { projects, deployments } from "@deployx/db";
import { requireAuth } from "../plugins/auth.js";
import { success } from "../utils/response.js";
import { getOwnedProject } from "../utils/ownership.js";
import {
  enqueueJob,
  createDeploymentAndEnqueueBuild,
} from "../queue/helpers.js";

const CreateProjectBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).max(48).regex(/^[a-z0-9-]+$/),
  source_type: z.enum(["git", "zip", "image", "cli"]),
  git_repo: z.string().url().optional(),
  git_branch: z.string().optional(),
  build_type: z.enum(["nixpacks", "railpack", "dockerfile"]),
  port: z.number().int().min(1).max(65535).optional(),
});

const UpdateProjectBody = z.object({
  name: z.string().min(1).optional(),
  git_repo: z.string().url().optional(),
  git_branch: z.string().optional(),
  build_type: z.enum(["nixpacks", "railpack", "dockerfile"]).optional(),
  port: z.number().int().min(1).max(65535).optional(),
});

const IdParam = z.object({
  id: z.string().min(1),
});

export async function projectRoutes(fastify: FastifyInstance): Promise<void> {
  // List projects
  fastify.get("/api/v1/projects", {
    onRequest: requireAuth,
    handler: async (request, reply) => {
      const rows = await fastify.db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.userId, request.user.sub),
            isNull(projects.deletedAt),
          ),
        );

      return reply.send(success(rows));
    },
  });

  // Create project
  fastify.post("/api/v1/projects", {
    schema: { body: CreateProjectBody },
    onRequest: requireAuth,
    handler: async (request, reply) => {
      const body = request.body as z.infer<typeof CreateProjectBody>;

      // Check slug uniqueness
      const [existing] = await fastify.db
        .select()
        .from(projects)
        .where(eq(projects.slug, body.slug))
        .limit(1);

      if (existing) {
        const err = new Error("Slug already taken") as Error & {
          statusCode: number;
        };
        err.statusCode = 409;
        throw err;
      }

      const now = new Date().toISOString();
      const id = ulid();

      const project = {
        id,
        userId: request.user.sub,
        name: body.name,
        slug: body.slug,
        sourceType: body.source_type,
        gitRepo: body.git_repo ?? null,
        gitBranch: body.git_branch ?? "main",
        buildType: body.build_type,
        port: body.port ?? 3000,
        status: "idle" as const,
        createdAt: now,
        updatedAt: now,
      };

      await fastify.db.insert(projects).values(project);

      return reply.status(201).send(success(project));
    },
  });

  // Get project
  fastify.get("/api/v1/projects/:id", {
    schema: { params: IdParam },
    onRequest: requireAuth,
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof IdParam>;
      const project = await getOwnedProject(fastify.db, request.user.sub, id);
      return reply.send(success(project));
    },
  });

  // Update project
  fastify.patch("/api/v1/projects/:id", {
    schema: { params: IdParam, body: UpdateProjectBody },
    onRequest: requireAuth,
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof IdParam>;
      const body = request.body as z.infer<typeof UpdateProjectBody>;

      // Ownership check
      await getOwnedProject(fastify.db, request.user.sub, id);

      const now = new Date().toISOString();

      // Build the update set, mapping snake_case body to camelCase columns
      const updateSet: Record<string, unknown> = { updatedAt: now };
      if (body.name !== undefined) updateSet["name"] = body.name;
      if (body.git_repo !== undefined) updateSet["gitRepo"] = body.git_repo;
      if (body.git_branch !== undefined)
        updateSet["gitBranch"] = body.git_branch;
      if (body.build_type !== undefined)
        updateSet["buildType"] = body.build_type;
      if (body.port !== undefined) updateSet["port"] = body.port;

      await fastify.db
        .update(projects)
        .set(updateSet)
        .where(eq(projects.id, id));

      // Re-fetch the updated project
      const [updated] = await fastify.db
        .select()
        .from(projects)
        .where(eq(projects.id, id))
        .limit(1);

      return reply.send(success(updated));
    },
  });

  // Soft-delete project
  fastify.delete("/api/v1/projects/:id", {
    schema: { params: IdParam },
    onRequest: requireAuth,
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof IdParam>;

      // Ownership check
      await getOwnedProject(fastify.db, request.user.sub, id);

      const now = new Date().toISOString();
      await fastify.db
        .update(projects)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(projects.id, id));

      return reply.send(success({ id, deleted: true }));
    },
  });

  // Trigger deploy
  fastify.post("/api/v1/projects/:id/deploy", {
    schema: { params: IdParam },
    onRequest: requireAuth,
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof IdParam>;
      const project = await getOwnedProject(fastify.db, request.user.sub, id);

      // Verify project has gitRepo if sourceType is "git"
      if (project.sourceType === "git" && !project.gitRepo) {
        const err = new Error(
          "Project source type is git but no git repository is configured",
        ) as Error & { statusCode: number };
        err.statusCode = 400;
        throw err;
      }

      const imageTag = `deployx/${project.slug}:deploy-${ulid()}`;

      const { deploymentId, jobId } = await createDeploymentAndEnqueueBuild(
        fastify.db,
        {
          projectId: id,
          trigger: "manual",
          buildPayload: {
            projectId: id,
            sourceDir: project.gitRepo ?? "",
            imageTag,
            buildType:
              (project.buildType as "nixpacks" | "railpack" | "dockerfile") ??
              "nixpacks",
            buildCmd: project.buildCmd ?? null,
            startCmd: project.startCmd ?? null,
            port: project.port ?? 3000,
          },
        },
      );

      return reply.status(202).send(success({ deploymentId, jobId }));
    },
  });

  // Stop project
  fastify.post("/api/v1/projects/:id/stop", {
    schema: { params: IdParam },
    onRequest: requireAuth,
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof IdParam>;
      const project = await getOwnedProject(fastify.db, request.user.sub, id);

      if (!project.containerId) {
        const err = new Error(
          "Project is not running — no container to stop",
        ) as Error & { statusCode: number };
        err.statusCode = 400;
        throw err;
      }

      // Create a deployment record for tracking the stop operation
      const deploymentId = ulid();
      const now = new Date().toISOString();

      const latestDeployments = await fastify.db
        .select({ version: deployments.version })
        .from(deployments)
        .where(eq(deployments.projectId, id))
        .orderBy(desc(deployments.version))
        .limit(1);

      const version = (latestDeployments[0]?.version ?? 0) + 1;

      await fastify.db.insert(deployments).values({
        id: deploymentId,
        projectId: id,
        version,
        trigger: "manual",
        status: "queued",
        createdAt: now,
      });

      const jobId = await enqueueJob(fastify.db, {
        deploymentId,
        type: "stop",
        payload: {
          projectId: id,
          containerId: project.containerId,
        },
      });

      return reply.status(202).send(success({ deploymentId, jobId }));
    },
  });

  // Restart project
  fastify.post("/api/v1/projects/:id/restart", {
    schema: { params: IdParam },
    onRequest: requireAuth,
    handler: async (request, reply) => {
      const { id } = request.params as z.infer<typeof IdParam>;
      const project = await getOwnedProject(fastify.db, request.user.sub, id);

      if (!project.containerId) {
        const err = new Error(
          "Project is not running — no container to restart",
        ) as Error & { statusCode: number };
        err.statusCode = 400;
        throw err;
      }

      // Create a deployment record for tracking the restart operation
      const deploymentId = ulid();
      const now = new Date().toISOString();

      const latestDeployments = await fastify.db
        .select({ version: deployments.version })
        .from(deployments)
        .where(eq(deployments.projectId, id))
        .orderBy(desc(deployments.version))
        .limit(1);

      const version = (latestDeployments[0]?.version ?? 0) + 1;

      await fastify.db.insert(deployments).values({
        id: deploymentId,
        projectId: id,
        version,
        trigger: "manual",
        status: "queued",
        createdAt: now,
      });

      const jobId = await enqueueJob(fastify.db, {
        deploymentId,
        type: "restart",
        payload: {
          projectId: id,
          containerId: project.containerId,
        },
      });

      return reply.status(202).send(success({ deploymentId, jobId }));
    },
  });
}
