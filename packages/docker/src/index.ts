import Docker from "dockerode";

// ─── Type Definitions ────────────────────────────────────────────────────────

export interface CreateContainerOpts {
  name: string;
  image: string;
  env?: string[];
  labels?: Record<string, string>;
  exposedPorts?: number[];
  hostPort?: number;
  networkName?: string;
  memory?: number;
  cpuQuota?: number;
  pidsLimit?: number;
  user?: string;
  readonlyRootfs?: boolean;
  volumes?: Record<string, string>;
  cmd?: string[];
  workingDir?: string;
  restartPolicy?: "no" | "always" | "unless-stopped" | "on-failure";
}

export interface BuildImageOpts {
  tag: string;
  dockerfile?: string;
  buildArgs?: Record<string, string>;
  labels?: Record<string, string>;
  target?: string;
  nocache?: boolean;
}

export interface ContainerStats {
  containerId: string;
  cpuPct: number;
  memMb: number;
  memLimitMb: number;
  netRxKb: number;
  netTxKb: number;
  blkReadMb: number;
  blkWriteMb: number;
  ts: string;
}

export interface LogOpts {
  follow?: boolean;
  stdout?: boolean;
  stderr?: boolean;
  since?: number;
  until?: number;
  tail?: number;
  timestamps?: boolean;
}

export interface EventFilters {
  container?: string[];
  event?: string[];
  image?: string[];
  label?: string[];
  type?: string[];
}

// ─── Security Defaults (PRD Section 18.4) ────────────────────────────────────

export const SECURE_CONTAINER_DEFAULTS = {
  SecurityOpt: [
    "no-new-privileges:true",
    "seccomp:default",
    "apparmor:docker-default",
  ],
  CapDrop: ["ALL"],
  CapAdd: [] as string[],
  PidsLimit: 256,
  ReadonlyRootfs: false,
  Privileged: false, // NEVER set to true
  User: "1000:1000",
  Memory: 512 * 1024 * 1024, // 512 MB in bytes
  CpuQuota: 100_000,
} as const;

// ─── Traefik Label Generator (PRD Section 12.3) ─────────────────────────────

/**
 * Generates Traefik reverse-proxy labels for a container.
 *
 * @param slug - URL-safe project slug (used as router/service name)
 * @param domain - Fully qualified domain name for routing
 * @param port - Container port the application listens on
 * @returns Record of Docker labels for Traefik configuration
 */
export function generateTraefikLabels(
  slug: string,
  domain: string,
  port: number,
): Record<string, string> {
  return {
    "traefik.enable": "true",
    [`traefik.http.routers.${slug}.rule`]: `Host(\`${domain}\`)`,
    [`traefik.http.routers.${slug}.tls`]: "true",
    [`traefik.http.routers.${slug}.tls.certresolver`]: "letsencrypt",
    [`traefik.http.services.${slug}.loadbalancer.server.port`]:
      String(port),
    [`traefik.http.routers.${slug}.middlewares`]:
      "security-headers@file",
  };
}

// ─── Docker Client ───────────────────────────────────────────────────────────

/**
 * High-level Docker client that connects to a docker-socket-proxy.
 * Wraps `dockerode` with opinionated security defaults and
 * convenience methods for the DeployX platform.
 */
export class DockerClient {
  private readonly docker: Docker;

  constructor(opts?: { host?: string; port?: number }) {
    this.docker = new Docker({
      host: opts?.host ?? "docker-proxy",
      port: opts?.port ?? 2375,
      protocol: "http",
    });
  }

  /**
   * Creates and starts a container with security defaults enforced.
   * Returns the container ID.
   */
  async createAndStartContainer(
    opts: CreateContainerOpts,
  ): Promise<string> {
    const exposedPorts: Record<string, object> = {};
    const portBindings: Record<string, Array<{ HostPort: string }>> = {};

    if (opts.exposedPorts) {
      for (const p of opts.exposedPorts) {
        exposedPorts[`${p}/tcp`] = {};
      }
    }

    if (opts.hostPort && opts.exposedPorts?.[0]) {
      portBindings[`${opts.exposedPorts[0]}/tcp`] = [
        { HostPort: String(opts.hostPort) },
      ];
    }

    const restartPolicyName = opts.restartPolicy ?? "unless-stopped";
    const restartMaxRetry = restartPolicyName === "on-failure" ? 5 : 0;

    const binds: string[] = [];
    if (opts.volumes) {
      for (const [hostPath, containerPath] of Object.entries(
        opts.volumes,
      )) {
        binds.push(`${hostPath}:${containerPath}`);
      }
    }

    const container = await this.docker.createContainer({
      name: opts.name,
      Image: opts.image,
      Env: opts.env ?? [],
      Labels: opts.labels ?? {},
      ExposedPorts: exposedPorts,
      Cmd: opts.cmd,
      WorkingDir: opts.workingDir,
      HostConfig: {
        PortBindings: portBindings,
        Binds: binds.length > 0 ? binds : undefined,
        Memory: opts.memory ?? SECURE_CONTAINER_DEFAULTS.Memory,
        CpuQuota: opts.cpuQuota ?? SECURE_CONTAINER_DEFAULTS.CpuQuota,
        PidsLimit:
          opts.pidsLimit ?? SECURE_CONTAINER_DEFAULTS.PidsLimit,
        ReadonlyRootfs:
          opts.readonlyRootfs ??
          SECURE_CONTAINER_DEFAULTS.ReadonlyRootfs,
        SecurityOpt: [...SECURE_CONTAINER_DEFAULTS.SecurityOpt],
        CapDrop: [...SECURE_CONTAINER_DEFAULTS.CapDrop],
        CapAdd: [...SECURE_CONTAINER_DEFAULTS.CapAdd],
        Privileged: false, // NEVER allow privileged containers
        RestartPolicy: {
          Name: restartPolicyName,
          MaximumRetryCount: restartMaxRetry,
        },
        NetworkMode: opts.networkName,
      },
      User: opts.user ?? SECURE_CONTAINER_DEFAULTS.User,
    });

    await container.start();
    return container.id;
  }

  /**
   * Stops a running container gracefully.
   *
   * @param containerId - Container ID or name
   * @param timeout - Seconds to wait before force-killing (default: 10)
   */
  async stopContainer(
    containerId: string,
    timeout = 10,
  ): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.stop({ t: timeout });
  }

  /**
   * Removes a container (force removes if still running).
   */
  async removeContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.remove({ force: true, v: true });
  }

  /**
   * Builds a Docker image from a tar stream context.
   * Returns the image ID.
   */
  async buildImage(
    context: NodeJS.ReadableStream,
    opts: BuildImageOpts,
  ): Promise<string> {
    const buildArgs: Record<string, string> = opts.buildArgs ?? {};

    const stream = await this.docker.buildImage(
      context as NodeJS.ReadableStream & { pipe: unknown },
      {
        t: opts.tag,
        dockerfile: opts.dockerfile ?? "Dockerfile",
        buildargs: buildArgs,
        labels: opts.labels,
        target: opts.target,
        nocache: opts.nocache ?? false,
      },
    );

    return new Promise<string>((resolve, reject) => {
      let imageId = "";

      this.docker.modem.followProgress(
        stream,
        (err: Error | null) => {
          if (err) {
            reject(err);
            return;
          }
          if (!imageId) {
            reject(new Error("Build completed but no image ID found"));
            return;
          }
          resolve(imageId);
        },
        (event: { aux?: { ID?: string }; stream?: string }) => {
          if (event.aux?.ID) {
            imageId = event.aux.ID;
          }
        },
      );
    });
  }

  /**
   * Gets a one-shot snapshot of container resource usage.
   */
  async getContainerStats(containerId: string): Promise<ContainerStats> {
    const container = this.docker.getContainer(containerId);
    const stats = (await container.stats({ stream: false })) as DockerStatsResponse;
    return parseStats(containerId, stats);
  }

  /**
   * Streams container stats, invoking the callback on each sample.
   * Returns a cleanup function that stops the stream.
   */
  async streamContainerStats(
    containerId: string,
    onData: (stats: ContainerStats) => void,
  ): Promise<() => void> {
    const container = this.docker.getContainer(containerId);
    const stream = (await container.stats({
      stream: true,
    })) as NodeJS.ReadableStream;

    let buffer = "";

    const onChunk = (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const raw = JSON.parse(trimmed) as DockerStatsResponse;
          onData(parseStats(containerId, raw));
        } catch {
          // Skip malformed JSON lines
        }
      }
    };

    stream.on("data", onChunk);

    return () => {
      stream.removeListener("data", onChunk);
      if ("destroy" in stream && typeof stream.destroy === "function") {
        (stream as { destroy: () => void }).destroy();
      }
    };
  }

  /**
   * Connects a container to a Docker network.
   */
  async connectToNetwork(
    networkName: string,
    containerId: string,
  ): Promise<void> {
    const network = this.docker.getNetwork(networkName);
    await network.connect({ Container: containerId });
  }

  /**
   * Disconnects a container from a Docker network.
   */
  async disconnectFromNetwork(
    networkName: string,
    containerId: string,
  ): Promise<void> {
    const network = this.docker.getNetwork(networkName);
    await network.disconnect({ Container: containerId });
  }

  /**
   * Creates a Docker network.
   *
   * @param name - Network name
   * @param internal - If true, restricts external access (default: false)
   * @returns Network ID
   */
  async createNetwork(
    name: string,
    internal = false,
  ): Promise<string> {
    const network = await this.docker.createNetwork({
      Name: name,
      Driver: "bridge",
      Internal: internal,
      CheckDuplicate: true,
    });
    return network.id;
  }

  /**
   * Gets container logs as a readable stream.
   */
  async getContainerLogs(
    containerId: string,
    opts?: LogOpts,
  ): Promise<NodeJS.ReadableStream> {
    const container = this.docker.getContainer(containerId);
    const logOpts = {
      stdout: opts?.stdout ?? true,
      stderr: opts?.stderr ?? true,
      since: opts?.since,
      until: opts?.until,
      tail: opts?.tail,
      timestamps: opts?.timestamps ?? false,
    };

    if (opts?.follow) {
      // follow: true overload returns ReadableStream
      const stream = await container.logs({ ...logOpts, follow: true });
      return stream as unknown as NodeJS.ReadableStream;
    }

    // follow: false (default) overload returns Buffer
    const buf = await container.logs({ ...logOpts, follow: false });
    const { Readable } = await import("node:stream");
    const readable = new Readable({
      read() {
        this.push(buf);
        this.push(null);
      },
    });
    return readable;
  }

  /**
   * Gets a stream of Docker engine events, optionally filtered.
   */
  async getEvents(
    filters?: EventFilters,
  ): Promise<NodeJS.ReadableStream> {
    const dockerFilters: Record<string, string[]> = {};
    if (filters) {
      if (filters.container)
        dockerFilters["container"] = filters.container;
      if (filters.event) dockerFilters["event"] = filters.event;
      if (filters.image) dockerFilters["image"] = filters.image;
      if (filters.label) dockerFilters["label"] = filters.label;
      if (filters.type) dockerFilters["type"] = filters.type;
    }

    const stream = await this.docker.getEvents({
      filters: dockerFilters,
    });

    return stream as NodeJS.ReadableStream;
  }

  /**
   * Pings the Docker daemon to verify connectivity.
   * Returns true if reachable, false otherwise.
   */
  async ping(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/** Minimal shape of the Docker stats JSON response we rely on. */
interface DockerStatsResponse {
  read: string;
  cpu_stats: {
    cpu_usage: { total_usage: number };
    system_cpu_usage: number;
    online_cpus?: number;
  };
  precpu_stats: {
    cpu_usage: { total_usage: number };
    system_cpu_usage: number;
  };
  memory_stats: {
    usage: number;
    limit: number;
  };
  networks?: Record<
    string,
    { rx_bytes: number; tx_bytes: number }
  >;
  blkio_stats?: {
    io_service_bytes_recursive?: Array<{
      op: string;
      value: number;
    }> | null;
  };
}

function parseStats(
  containerId: string,
  raw: DockerStatsResponse,
): ContainerStats {
  // CPU percentage calculation
  const cpuDelta =
    raw.cpu_stats.cpu_usage.total_usage -
    raw.precpu_stats.cpu_usage.total_usage;
  const systemDelta =
    raw.cpu_stats.system_cpu_usage -
    raw.precpu_stats.system_cpu_usage;
  const onlineCpus = raw.cpu_stats.online_cpus ?? 1;
  const cpuPct =
    systemDelta > 0 ? (cpuDelta / systemDelta) * onlineCpus * 100 : 0;

  // Memory
  const memMb = raw.memory_stats.usage / (1024 * 1024);
  const memLimitMb = raw.memory_stats.limit / (1024 * 1024);

  // Network (sum across all interfaces)
  let netRxBytes = 0;
  let netTxBytes = 0;
  if (raw.networks) {
    for (const iface of Object.values(raw.networks)) {
      netRxBytes += iface.rx_bytes;
      netTxBytes += iface.tx_bytes;
    }
  }

  // Block I/O
  let blkReadBytes = 0;
  let blkWriteBytes = 0;
  const ioEntries =
    raw.blkio_stats?.io_service_bytes_recursive ?? [];
  for (const entry of ioEntries) {
    const op = entry.op.toLowerCase();
    if (op === "read") blkReadBytes += entry.value;
    else if (op === "write") blkWriteBytes += entry.value;
  }

  return {
    containerId,
    cpuPct: Math.round(cpuPct * 100) / 100,
    memMb: Math.round(memMb * 100) / 100,
    memLimitMb: Math.round(memLimitMb * 100) / 100,
    netRxKb: Math.round((netRxBytes / 1024) * 100) / 100,
    netTxKb: Math.round((netTxBytes / 1024) * 100) / 100,
    blkReadMb: Math.round((blkReadBytes / (1024 * 1024)) * 100) / 100,
    blkWriteMb:
      Math.round((blkWriteBytes / (1024 * 1024)) * 100) / 100,
    ts: raw.read || new Date().toISOString(),
  };
}
