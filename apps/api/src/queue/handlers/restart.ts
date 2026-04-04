import { eq } from "drizzle-orm";
import { projects } from "@deployx/db";
import { DockerClient } from "@deployx/docker";
import { RestartJobPayloadSchema } from "@deployx/types";
import type { JobContext } from "../processor.js";

export async function handleRestartJob(
  ctx: JobContext,
): Promise<void> {
  const { job, db, logger } = ctx;

  const payload = RestartJobPayloadSchema.parse(
    JSON.parse(job.payload),
  );
  const docker = new DockerClient();

  await docker.restartContainer(payload.containerId);

  await db
    .update(projects)
    .set({ status: "running", updatedAt: new Date().toISOString() })
    .where(eq(projects.id, payload.projectId));

  logger.info(
    { containerId: payload.containerId },
    "Container restarted",
  );
}
