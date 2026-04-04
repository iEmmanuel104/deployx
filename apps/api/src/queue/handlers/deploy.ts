import { eq } from "drizzle-orm";
import { deployments, projects } from "@deployx/db";
import { DockerClient, generateTraefikLabels } from "@deployx/docker";
import { DeployJobPayloadSchema } from "@deployx/types";
import type { JobContext } from "../processor.js";

export async function handleDeployJob(ctx: JobContext): Promise<void> {
  const { job, db, logger } = ctx;

  const payload = DeployJobPayloadSchema.parse(JSON.parse(job.payload));
  const now = () => new Date().toISOString();
  const docker = new DockerClient();
  const containerName = `deployx-${payload.slug}`;

  // Remove old container if it exists (from previous deploy)
  try {
    await docker.removeContainer(containerName);
    logger.info({ containerName }, "Removed old container");
  } catch {
    // Container doesn't exist — expected for first deploy
  }

  // Generate Traefik labels for routing
  const labels = generateTraefikLabels({
    slug: payload.slug,
    port: payload.port,
    domain: payload.domain,
    platformDomain: payload.platformDomain,
  });

  // Add DeployX management labels
  labels["deployx.project"] = payload.projectId;
  labels["deployx.deployment"] = payload.deploymentId;

  // Build env array for Docker
  const env: string[] = [];
  if (payload.envVars) {
    for (const [k, v] of Object.entries(payload.envVars)) {
      env.push(`${k}=${v}`);
    }
  }
  env.push(`PORT=${String(payload.port)}`);

  // Create and start container
  const containerId = await docker.createAndStartContainer({
    name: containerName,
    image: payload.imageTag,
    env,
    labels,
    exposedPorts: [payload.port],
    networkName: "proxy-network",
    restartPolicy: "unless-stopped",
  });

  // Update deployment as successful
  await db
    .update(deployments)
    .set({ status: "success", finishedAt: now() })
    .where(eq(deployments.id, payload.deploymentId));

  // Update project with container ID and running status
  await db
    .update(projects)
    .set({ containerId, status: "running", updatedAt: now() })
    .where(eq(projects.id, payload.projectId));

  logger.info(
    { containerId, slug: payload.slug },
    "Container deployed",
  );
}
