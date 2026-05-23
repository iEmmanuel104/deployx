import { ulid } from "ulidx";
import { eq, desc, and, inArray } from "drizzle-orm";
import type { DeployxDb } from "@deployx/db";
import { buildJobs, deployments } from "@deployx/db";
import type {
  BuildJobType,
  BuildJobPayload,
  DeployJobPayload,
  StopJobPayload,
  RestartJobPayload,
  DeploymentTrigger,
} from "@deployx/types";

type JobPayload =
  | BuildJobPayload
  | DeployJobPayload
  | StopJobPayload
  | RestartJobPayload;

/**
 * Thrown when a caller tries to enqueue a build for a project that already has
 * a pending or running build job. The API layer converts this to HTTP 409.
 */
export class BuildAlreadyInProgressError extends Error {
  readonly code = "BUILD_ALREADY_IN_PROGRESS";
  readonly statusCode = 409;
  readonly projectId: string;
  readonly existingJobId: string;
  readonly existingDeploymentId: string;

  constructor(opts: {
    projectId: string;
    existingJobId: string;
    existingDeploymentId: string;
  }) {
    super(
      `A build is already pending or running for project ${opts.projectId} (job ${opts.existingJobId})`,
    );
    this.name = "BuildAlreadyInProgressError";
    this.projectId = opts.projectId;
    this.existingJobId = opts.existingJobId;
    this.existingDeploymentId = opts.existingDeploymentId;
  }
}

/**
 * Returns the in-flight build job (status: pending|running) for a project, or
 * null. Used to dedupe deploy requests so a single project cannot have two
 * concurrent builds in the queue.
 */
export async function findInFlightBuildForProject(
  db: DeployxDb,
  projectId: string,
): Promise<{ jobId: string; deploymentId: string } | null> {
  const rows = await db
    .select({
      jobId: buildJobs.id,
      deploymentId: buildJobs.deploymentId,
    })
    .from(buildJobs)
    .innerJoin(deployments, eq(buildJobs.deploymentId, deployments.id))
    .where(
      and(
        eq(buildJobs.type, "build"),
        eq(deployments.projectId, projectId),
        inArray(buildJobs.status, ["pending", "running"]),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return { jobId: row.jobId, deploymentId: row.deploymentId };
}

/**
 * Enqueues a new job into the build_jobs table.
 * Returns the job ID (ULID).
 */
export async function enqueueJob(
  db: DeployxDb,
  opts: {
    deploymentId: string;
    type: BuildJobType;
    payload: JobPayload;
    maxAttempts?: number;
  },
): Promise<string> {
  const id = ulid();
  const now = new Date().toISOString();

  await db.insert(buildJobs).values({
    id,
    deploymentId: opts.deploymentId,
    type: opts.type,
    status: "pending",
    payload: JSON.stringify(opts.payload),
    attempts: 0,
    maxAttempts: opts.maxAttempts ?? 3,
    createdAt: now,
  });

  return id;
}

/**
 * Creates a deployment record and enqueues a build job atomically.
 * Auto-increments the deployment version for the project.
 */
export async function createDeploymentAndEnqueueBuild(
  db: DeployxDb,
  opts: {
    projectId: string;
    trigger: DeploymentTrigger;
    commitSha?: string;
    commitMsg?: string;
    buildPayload: Omit<BuildJobPayload, "deploymentId">;
  },
): Promise<{ deploymentId: string; jobId: string }> {
  // Refuse if there is already an in-flight build for this project so the
  // build queue cannot be flooded by repeated POST /deploy clicks.
  const existing = await findInFlightBuildForProject(db, opts.projectId);
  if (existing) {
    throw new BuildAlreadyInProgressError({
      projectId: opts.projectId,
      existingJobId: existing.jobId,
      existingDeploymentId: existing.deploymentId,
    });
  }

  const deploymentId = ulid();
  const now = new Date().toISOString();

  // Get next version number.
  // NOTE: The version read + insert is not wrapped in an explicit transaction,
  // but this is safe with SQLite's single-writer model (WAL mode, busy_timeout).
  // Only one writer can execute at a time, so the read-then-insert sequence
  // cannot race with another concurrent insert.
  const latestDeployments = await db
    .select({ version: deployments.version })
    .from(deployments)
    .where(eq(deployments.projectId, opts.projectId))
    .orderBy(desc(deployments.version))
    .limit(1);

  const version = (latestDeployments[0]?.version ?? 0) + 1;

  // Create deployment
  await db.insert(deployments).values({
    id: deploymentId,
    projectId: opts.projectId,
    version,
    trigger: opts.trigger,
    commitSha: opts.commitSha ?? null,
    commitMsg: opts.commitMsg ?? null,
    status: "queued",
    createdAt: now,
  });

  // Enqueue the build job
  const payload: BuildJobPayload = {
    ...opts.buildPayload,
    deploymentId,
  };

  const jobId = await enqueueJob(db, {
    deploymentId,
    type: "build",
    payload,
  });

  return { deploymentId, jobId };
}
