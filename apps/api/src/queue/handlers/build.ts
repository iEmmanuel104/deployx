import { eq } from "drizzle-orm";
import { deployments, projects } from "@deployx/db";
import { buildWithNixpacks } from "@deployx/builder";
import { BuildJobPayloadSchema } from "@deployx/types";
import type { JobContext } from "../processor.js";

export async function handleBuildJob(ctx: JobContext): Promise<void> {
  const { job, db, logger } = ctx;

  // Validate payload with Zod before any business logic
  const payload = BuildJobPayloadSchema.parse(JSON.parse(job.payload));
  const now = () => new Date().toISOString();

  // Update deployment status to 'building'
  await db
    .update(deployments)
    .set({ status: "building", startedAt: now() })
    .where(eq(deployments.id, payload.deploymentId));

  // Update project status to 'building'
  await db
    .update(projects)
    .set({ status: "building", updatedAt: now() })
    .where(eq(projects.id, payload.projectId));

  try {
    logger.info({ imageTag: payload.imageTag }, "Starting Nixpacks build");

    const result = await buildWithNixpacks({
      sourceDir: payload.sourceDir,
      imageTag: payload.imageTag,
      buildType: payload.buildType,
      buildCmd: payload.buildCmd,
      startCmd: payload.startCmd,
      envVars: payload.envVars,
      noCache: false,
    });

    // Update deployment with build results
    await db
      .update(deployments)
      .set({
        imageTag: result.imageTag,
        buildLog: result.buildLog,
        status: "deploying",
      })
      .where(eq(deployments.id, payload.deploymentId));

    // Update project with image tag
    await db
      .update(projects)
      .set({ imageTag: result.imageTag, updatedAt: now() })
      .where(eq(projects.id, payload.projectId));

    logger.info(
      { imageTag: result.imageTag, durationMs: result.durationMs },
      "Build succeeded",
    );
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : String(err);

    await db
      .update(deployments)
      .set({
        status: "failed",
        errorMsg,
        finishedAt: now(),
      })
      .where(eq(deployments.id, payload.deploymentId));

    await db
      .update(projects)
      .set({ status: "error", updatedAt: now() })
      .where(eq(projects.id, payload.projectId));

    throw err; // Re-throw so processor records the failure
  }
}
