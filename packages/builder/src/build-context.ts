import tarFs from "tar-fs";
import { DockerClient } from "@deployx/docker";
import { BuildError } from "./errors.js";

export interface BuildImageFromContextOpts {
  /** Directory to tar as the docker build context. */
  contextDir: string;
  /** Dockerfile path relative to contextDir. Default: "Dockerfile". */
  dockerfile?: string;
  /** Image tag (`repo:tag`) to apply to the built image. */
  tag: string;
  /** Build args passed to the Dockerfile (`ARG` directives). */
  buildArgs?: Record<string, string>;
  /** Labels applied to the built image. */
  labels?: Record<string, string>;
  /** Override the dockerode client. Default: new DockerClient() (docker-proxy). */
  dockerClient?: DockerClient;
}

export interface BuildImageFromContextResult {
  imageId: string;
  imageTag: string;
  durationMs: number;
}

/**
 * Tars a directory and ships it to the docker engine's HTTP `/build` endpoint
 * via dockerode. This is the replacement for the previous `docker buildx`
 * shellout — it relies only on the existing allowlisted HTTP endpoint exposed
 * by docker-socket-proxy (no WebSocket upgrade needed).
 *
 * The context dir is streamed (not buffered) so large repos do not blow up
 * Node memory.
 */
export async function buildImageFromContext(
  opts: BuildImageFromContextOpts,
): Promise<BuildImageFromContextResult> {
  const startTime = Date.now();
  const client = opts.dockerClient ?? new DockerClient();

  // tar-fs pack() returns a Readable that streams the tar bytes — no need to
  // materialise the whole archive in memory.
  const tarStream = tarFs.pack(opts.contextDir) as unknown as NodeJS.ReadableStream;

  try {
    const imageId = await client.buildImage(tarStream, {
      tag: opts.tag,
      dockerfile: opts.dockerfile ?? "Dockerfile",
      buildArgs: opts.buildArgs,
      labels: opts.labels,
    });

    return {
      imageId,
      imageTag: opts.tag,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    throw new BuildError(
      "IMAGE_BUILD_FAILED",
      `Docker image build failed for ${opts.tag}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
