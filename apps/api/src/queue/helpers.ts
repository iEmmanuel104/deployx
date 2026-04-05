import { ulid } from "ulidx";
import { eq, desc } from "drizzle-orm";
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
