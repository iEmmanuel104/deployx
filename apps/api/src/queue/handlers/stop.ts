import { eq } from "drizzle-orm";
import { projects } from "@deployx/db";
import { DockerClient } from "@deployx/docker";
import { StopJobPayloadSchema } from "@deployx/types";
import type { JobContext } from "../processor.js";

export async function handleStopJob(ctx: JobContext): Promise<void> {
  const { job, db, logger } = ctx;

  const payload = StopJobPayloadSchema.parse(JSON.parse(job.payload));
  const docker = new DockerClient();

  await docker.stopContainer(payload.containerId);

  await db
    .update(projects)
    .set({ status: "stopped", updatedAt: new Date().toISOString() })
    .where(eq(projects.id, payload.projectId));

  logger.info(
    { containerId: payload.containerId },
    "Container stopped",
  );
}
