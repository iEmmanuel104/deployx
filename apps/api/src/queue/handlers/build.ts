import { eq } from "drizzle-orm";
import { deployments, projects } from "@deployx/db";
import { buildWithNixpacks, cloneRepo, cleanupBuildDir } from "@deployx/builder";
import { BuildJobPayloadSchema } from "@deployx/types";
import type { DeployJobPayload } from "@deployx/types";
import type { JobContext } from "../processor.js";
import { enqueueJob } from "../helpers.js";

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

  // For git sources, clone the repo first to get a local directory
  let actualSourceDir = payload.sourceDir;
  let clonedDir: string | null = null;

  if (payload.sourceDir.startsWith("http") || payload.sourceDir.startsWith("git@")) {
    const project = (await db.select().from(projects).where(eq(projects.id, payload.projectId)).limit(1))[0];
    const cloneResult = await cloneRepo(
      payload.sourceDir,
      project?.gitBranch ?? "main",
      project?.slug ?? "build",
    );
    actualSourceDir = cloneResult.dir;
    clonedDir = cloneResult.dir;
  }

  try {
    logger.info({ imageTag: payload.imageTag }, "Starting Nixpacks build");

    const result = await buildWithNixpacks({
      sourceDir: actualSourceDir,
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

    // Enqueue follow-up deploy job
    const projectRows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, payload.projectId))
      .limit(1);

    const project = projectRows[0];
    if (project) {
      const deployPayload: DeployJobPayload = {
        projectId: payload.projectId,
        deploymentId: payload.deploymentId,
        imageTag: result.imageTag,
        slug: project.slug,
        port: payload.port,
        envVars: payload.envVars,
        platformDomain: process.env["PLATFORM_DOMAIN"],
      };

      await enqueueJob(db, {
        deploymentId: payload.deploymentId,
        type: "deploy",
        payload: deployPayload,
      });

      logger.info(
        { deploymentId: payload.deploymentId },
        "Deploy job enqueued after build",
      );
    }

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
  } finally {
    // Clean up cloned directory if we created one
    if (clonedDir) {
      await cleanupBuildDir(clonedDir);
    }
  }
}
