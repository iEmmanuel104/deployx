import { access } from "node:fs/promises";
import { isAbsolute, join, normalize, relative } from "node:path";
import { buildImageFromContext } from "./build-context.js";
import type { BuildImageFromContextResult } from "./build-context.js";
import { BuildError } from "./errors.js";
import type { DockerClient } from "@deployx/docker";

export interface BuildFromUserDockerfileOpts {
  contextDir: string;
  /** Path to the Dockerfile, relative to contextDir. Default: "Dockerfile". */
  dockerfilePath?: string;
  tag: string;
  envVars?: Record<string, string>;
  labels?: Record<string, string>;
  dockerClient?: DockerClient;
}

/**
 * Builds a Docker image from a user-supplied Dockerfile.
 *
 * Unlike the Nixpacks path, this skips Dockerfile generation entirely and
 * ships the user's repo straight to the docker engine's HTTP /build endpoint
 * via the existing DockerClient.buildImage() wrapper.
 *
 * envVars are forwarded as `ARG` build-args; only ARGs declared in the
 * Dockerfile are visible at build time. Labels are applied to the built image.
 *
 * Security: the Dockerfile path is validated to stay inside contextDir.
 * Symlink traversal is prevented because docker tars the context directory
 * and resolves the Dockerfile path inside the archive.
 */
export async function buildFromUserDockerfile(
  opts: BuildFromUserDockerfileOpts,
): Promise<BuildImageFromContextResult> {
  const dockerfilePath = opts.dockerfilePath ?? "Dockerfile";

  if (isAbsolute(dockerfilePath)) {
    throw new BuildError(
      "INVALID_DOCKERFILE_PATH",
      `Dockerfile path must be relative to contextDir, got absolute: ${dockerfilePath}`,
    );
  }

  const normalized = normalize(dockerfilePath);
  const resolved = normalize(join(opts.contextDir, normalized));
  const rel = relative(opts.contextDir, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new BuildError(
      "INVALID_DOCKERFILE_PATH",
      `Dockerfile path escapes contextDir: ${dockerfilePath}`,
    );
  }

  try {
    await access(resolved);
  } catch {
    throw new BuildError(
      "DOCKERFILE_NOT_FOUND",
      `Dockerfile not found at ${rel} inside ${opts.contextDir}`,
    );
  }

  return buildImageFromContext({
    contextDir: opts.contextDir,
    dockerfile: normalized,
    tag: opts.tag,
    buildArgs: opts.envVars,
    labels: opts.labels,
    dockerClient: opts.dockerClient,
  });
}
