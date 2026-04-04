import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { ulid } from "ulidx";
import { deployments } from "@deployx/db";
import { requireAuth } from "../plugins/auth.js";
import { success } from "../utils/response.js";
import { getOwnedProject } from "../utils/ownership.js";
import { enqueueJob } from "../queue/helpers.js";

const ProjectIdParam = z.object({
  projectId: z.string().min(1),
});

const DeploymentParams = z.object({
  projectId: z.string().min(1),
  id: z.string().min(1),
});

export async function deploymentRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  // List deployments
  fastify.get("/api/v1/projects/:projectId/deployments", {
    schema: { params: ProjectIdParam },
    onRequest: requireAuth,
    handler: async (request, reply) => {
      const { projectId } = request.params as z.infer<typeof ProjectIdParam>;

      // Ownership check
      await getOwnedProject(fastify.db, request.user.sub, projectId);

      const rows = await fastify.db
        .select()
        .from(deployments)
        .where(eq(deployments.projectId, projectId))
        .orderBy(desc(deployments.createdAt));

      return reply.send(success(rows));
    },
  });

  // Get deployment
  fastify.get("/api/v1/projects/:projectId/deployments/:id", {
    schema: { params: DeploymentParams },
    onRequest: requireAuth,
    handler: async (request, reply) => {
      const { projectId, id } = request.params as z.infer<
        typeof DeploymentParams
      >;

      // Ownership check
      await getOwnedProject(fastify.db, request.user.sub, projectId);

      const [deployment] = await fastify.db
        .select()
        .from(deployments)
        .where(
          and(eq(deployments.id, id), eq(deployments.projectId, projectId)),
        )
        .limit(1);

      if (!deployment) {
        const err = new Error("Deployment not found") as Error & {
          statusCode: number;
        };
        err.statusCode = 404;
        throw err;
      }

      return reply.send(success(deployment));
    },
  });

  // Rollback deployment
  fastify.post("/api/v1/projects/:projectId/deployments/:id/rollback", {
    schema: { params: DeploymentParams },
    onRequest: requireAuth,
    handler: async (request, reply) => {
      const { projectId, id } = request.params as z.infer<
        typeof DeploymentParams
      >;

      // Ownership check
      const project = await getOwnedProject(
        fastify.db,
        request.user.sub,
        projectId,
      );

      // Find the target deployment
      const [targetDeployment] = await fastify.db
        .select()
        .from(deployments)
        .where(
          and(eq(deployments.id, id), eq(deployments.projectId, projectId)),
        )
        .limit(1);

      if (!targetDeployment) {
        const err = new Error("Deployment not found") as Error & {
          statusCode: number;
        };
        err.statusCode = 404;
        throw err;
      }

      if (
        targetDeployment.status !== "success" ||
        !targetDeployment.imageTag
      ) {
        const err = new Error(
          "Cannot rollback to a non-successful deployment",
        ) as Error & { statusCode: number };
        err.statusCode = 400;
        throw err;
      }

      // Get next version number
      const latestDeployments = await fastify.db
        .select({ version: deployments.version })
        .from(deployments)
        .where(eq(deployments.projectId, projectId))
        .orderBy(desc(deployments.version))
        .limit(1);

      const version = (latestDeployments[0]?.version ?? 0) + 1;

      // Create new deployment with the existing imageTag
      const deploymentId = ulid();
      const now = new Date().toISOString();

      await fastify.db.insert(deployments).values({
        id: deploymentId,
        projectId,
        version,
        trigger: "manual",
        imageTag: targetDeployment.imageTag,
        status: "queued",
        createdAt: now,
      });

      // Enqueue a deploy job (skip build, use existing image)
      const jobId = await enqueueJob(fastify.db, {
        deploymentId,
        type: "deploy",
        payload: {
          projectId,
          deploymentId,
          imageTag: targetDeployment.imageTag,
          slug: project.slug,
          port: project.port ?? 3000,
        },
      });

      return reply.status(202).send(success({ deploymentId, jobId }));
    },
  });
}
