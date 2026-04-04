import Docker from "dockerode";
import type { HealthCheck } from "@deployx/types";

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
  healthcheck?: {
    test: string[];
    interval?: number;
    timeout?: number;
    startPeriod?: number;
    retries?: number;
  };
}

export interface BuildImageOpts {
  tag: string;
  dockerfile?: string;
  buildArgs?: Record<string, string>;
  labels?: Record<string, string>;
  target?: string;
  nocache?: boolean;
  memory?: number;
  cpuQuota?: number;
  networkMode?: string;
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

// ─── Container List/Inspect Types ───────────────────────────────────────────

export interface ContainerListInfo {
  id: string;
  names: string[];
  image: string;
  imageId: string;
  state: string;
  status: string;
  labels: Record<string, string>;
  ports: Array<{ privatePort: number; publicPort?: number; type: string }>;
  created: number;
  networkMode: string;
}

export interface ContainerInspect {
  id: string;
  name: string;
  state: {
    status: string;
    running: boolean;
    paused: boolean;
    restarting: boolean;
    exitCode: number;
    startedAt: string;
    finishedAt: string;
    health?: { status: string; failingStreak: number };
  };
  image: string;
  config: {
    env: string[];
    cmd: string[];
    labels: Record<string, string>;
    exposedPorts: string[];
    workingDir: string;
  };
  hostConfig: {
    memory: number;
    cpuQuota: number;
    pidsLimit: number;
    networkMode: string;
    restartPolicy: { name: string; maximumRetryCount: number };
  };
  networkSettings: {
    ports: Record<string, Array<{ hostIp: string; hostPort: string }>>;
    networks: Record<
      string,
      { ipAddress: string; gateway: string; networkId: string }
    >;
  };
  mounts: Array<{
    type: string;
    source: string;
    destination: string;
    rw: boolean;
  }>;
  created: string;
}

// ─── Image Types ────────────────────────────────────────────────────────────

export interface PullProgressEvent {
  status: string;
  id?: string;
  progress?: string;
  progressDetail?: { current?: number; total?: number };
}

export interface ImageListInfo {
  id: string;
  repoTags: string[];
  created: number;
  size: number;
  labels: Record<string, string>;
}

export interface ImageInspect {
  id: string;
  repoTags: string[];
  created: string;
  size: number;
  architecture: string;
  os: string;
  config: {
    env: string[];
    cmd: string[];
    labels: Record<string, string>;
    exposedPorts: string[];
    workingDir: string;
    healthcheck?: {
      test: string[];
      interval?: number;
      timeout?: number;
      retries?: number;
    };
  };
}

// ─── Network Types ──────────────────────────────────────────────────────────

export interface NetworkListInfo {
  id: string;
  name: string;
  driver: string;
  scope: string;
  internal: boolean;
  labels: Record<string, string>;
  containers: Record<
    string,
    { name: string; ipv4Address: string }
  >;
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

export const SECURE_BUILD_DEFAULTS = {
  networkMode: "none",
  memory: 1024 * 1024 * 1024, // 1 GB
  cpuQuota: 100_000,
} as const;

// ─── Duration Parsing ───────────────────────────────────────────────────────

const DURATION_MULTIPLIERS: Record<string, number> = {
  ms: 1_000_000,
  s: 1_000_000_000,
  m: 60_000_000_000,
  h: 3_600_000_000_000,
};

/**
 * Converts a human-readable duration string to nanoseconds.
 * Supported units: ms, s, m, h.
 *
 * @example parseDuration("30s") // => 30_000_000_000
 */
export function parseDuration(s: string): number {
  const match = /^(\d+)(ms|s|m|h)$/.exec(s);
  if (!match) {
    throw new Error(
      `Invalid duration: "${s}" (expected e.g. "30s", "5m", "100ms")`,
    );
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  return value * DURATION_MULTIPLIERS[unit];
}

/**
 * Converts a platform HealthCheck config into Docker Healthcheck options.
 */
export function healthCheckToDockerOpts(
  hc: HealthCheck,
): NonNullable<CreateContainerOpts["healthcheck"]> {
  return {
    test: [
      "CMD-SHELL",
      `wget --no-verbose --tries=1 --spider http://localhost${hc.path} || exit 1`,
    ],
    interval: parseDuration(hc.interval),
    timeout: parseDuration(hc.timeout),
    retries: hc.retries,
    startPeriod: 0,
  };
}

// ─── Traefik Label Generator (PRD Section 12.3) ─────────────────────────────

export interface TraefikLabelOpts {
  slug: string;
  /** Explicit FQDN for the router rule (custom domain). */
  domain?: string;
  /** Platform domain — generates {slug}.{platformDomain} if no explicit domain. */
  platformDomain?: string;
  /** Container port the application listens on. */
  port: number;
  /** Health check path for Traefik load balancer (e.g., "/health"). */
  healthCheckPath?: string;
  /** Middleware names to apply (default: ["security-headers@file"]). */
  middlewares?: string[];
}

/**
 * Generates Traefik reverse-proxy labels for a container.
 *
 * Either `domain` or `platformDomain` must be provided.
 * If both are given, `domain` takes precedence.
 */
export function generateTraefikLabels(
  opts: TraefikLabelOpts,
): Record<string, string> {
  const host = opts.domain ?? (
    opts.platformDomain ? `${opts.slug}.${opts.platformDomain}` : undefined
  );

  if (!host) {
    throw new Error(
      "generateTraefikLabels: either domain or platformDomain must be provided",
    );
  }

  const middlewares = opts.middlewares ?? ["security-headers@file"];

  const labels: Record<string, string> = {
    "traefik.enable": "true",
    [`traefik.http.routers.${opts.slug}.rule`]: `Host(\`${host}\`)`,
    [`traefik.http.routers.${opts.slug}.tls`]: "true",
    [`traefik.http.routers.${opts.slug}.tls.certresolver`]: "letsencrypt",
    [`traefik.http.services.${opts.slug}.loadbalancer.server.port`]:
      String(opts.port),
    [`traefik.http.routers.${opts.slug}.middlewares`]:
      middlewares.join(","),
  };

  if (opts.healthCheckPath) {
    labels[
      `traefik.http.services.${opts.slug}.loadbalancer.healthcheck.path`
    ] = opts.healthCheckPath;
    labels[
      `traefik.http.services.${opts.slug}.loadbalancer.healthcheck.interval`
    ] = "10s";
    labels[
      `traefik.http.services.${opts.slug}.loadbalancer.healthcheck.timeout`
    ] = "5s";
  }

  return labels;
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
        exposedPorts[`${String(p)}/tcp`] = {};
      }
    }

    if (opts.hostPort && opts.exposedPorts?.[0]) {
      portBindings[`${String(opts.exposedPorts[0])}/tcp`] = [
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
      Healthcheck: opts.healthcheck
        ? {
            Test: opts.healthcheck.test,
            Interval: opts.healthcheck.interval,
            Timeout: opts.healthcheck.timeout,
            StartPeriod: opts.healthcheck.startPeriod,
            Retries: opts.healthcheck.retries,
          }
        : undefined,
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
        // Build isolation (PRD Section 18.4)
        networkmode:
          opts.networkMode ?? SECURE_BUILD_DEFAULTS.networkMode,
        memory: opts.memory ?? SECURE_BUILD_DEFAULTS.memory,
        cpuquota: opts.cpuQuota ?? SECURE_BUILD_DEFAULTS.cpuQuota,
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
    const stream: NodeJS.ReadableStream = await container.stats({
      stream: true,
    });

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

    const eventStream: NodeJS.ReadableStream = stream;
    return eventStream;
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

  // ─── Container Discovery ──────────────────────────────────────────────────

  /**
   * Lists containers, optionally filtered by labels and/or status.
   */
  async listContainers(opts?: {
    labels?: Record<string, string>;
    status?: string[];
    all?: boolean;
  }): Promise<ContainerListInfo[]> {
    const filters: Record<string, string[]> = {};
    if (opts?.labels) {
      filters["label"] = Object.entries(opts.labels).map(([k, v]) =>
        v ? `${k}=${v}` : k,
      );
    }
    if (opts?.status) {
      filters["status"] = opts.status;
    }
    const containers = await this.docker.listContainers({
      all: opts?.all ?? true,
      filters,
    });
    return containers.map(mapContainerListInfo);
  }

  /**
   * Gets detailed container state, config, ports, and network info.
   */
  async inspectContainer(
    containerId: string,
  ): Promise<ContainerInspect> {
    const container = this.docker.getContainer(containerId);
    const info = await container.inspect();
    return mapContainerInspect(info);
  }

  /**
   * Gracefully restarts a container.
   */
  async restartContainer(
    containerId: string,
    timeout = 10,
  ): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.restart({ t: timeout });
  }

  // ─── Image Operations ─────────────────────────────────────────────────────

  /**
   * Pulls an image from a registry.
   * Returns the repo:tag once complete.
   */
  async pullImage(
    repoTag: string,
    onProgress?: (event: PullProgressEvent) => void,
  ): Promise<string> {
    const stream = await this.docker.pull(repoTag, {});
    return new Promise<string>((resolve, reject) => {
      this.docker.modem.followProgress(
        stream,
        (err: Error | null) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(repoTag);
        },
        (event: PullProgressEvent) => {
          onProgress?.(event);
        },
      );
    });
  }

  /**
   * Lists images, optionally filtered by labels.
   */
  async listImages(opts?: {
    labels?: Record<string, string>;
    all?: boolean;
  }): Promise<ImageListInfo[]> {
    const filters: Record<string, string[]> = {};
    if (opts?.labels) {
      filters["label"] = Object.entries(opts.labels).map(([k, v]) =>
        v ? `${k}=${v}` : k,
      );
    }
    const images = await this.docker.listImages({
      all: opts?.all ?? false,
      filters,
    });
    return images.map(mapImageListInfo);
  }

  /**
   * Removes an image by ID or tag.
   */
  async removeImage(
    imageId: string,
    force = false,
  ): Promise<void> {
    const image = this.docker.getImage(imageId);
    await image.remove({ force });
  }

  // ─── Network Discovery ────────────────────────────────────────────────────

  /**
   * Lists Docker networks, optionally filtered by label or name.
   */
  async listNetworks(opts?: {
    labels?: Record<string, string>;
    names?: string[];
  }): Promise<NetworkListInfo[]> {
    const filters: Record<string, string[]> = {};
    if (opts?.labels) {
      filters["label"] = Object.entries(opts.labels).map(([k, v]) =>
        v ? `${k}=${v}` : k,
      );
    }
    if (opts?.names) {
      filters["name"] = opts.names;
    }
    const networks = await this.docker.listNetworks({ filters });
    return networks.map(mapNetworkListInfo);
  }

  /**
   * Removes a Docker network by name or ID.
   */
  async removeNetwork(networkId: string): Promise<void> {
    const network = this.docker.getNetwork(networkId);
    await network.remove();
  }

  // ─── Maintenance Operations ─────────────────────────────────────────────

  /**
   * Removes all dangling (untagged) images.
   */
  async pruneImages(): Promise<{
    imagesDeleted: number;
    spaceReclaimed: number;
  }> {
    const result = await this.docker.pruneImages({});
    return {
      imagesDeleted: (result as { ImagesDeleted?: unknown[] }).ImagesDeleted?.length ?? 0,
      spaceReclaimed: (result as { SpaceReclaimed?: number }).SpaceReclaimed ?? 0,
    };
  }

  /**
   * Removes all unused networks.
   */
  async pruneNetworks(): Promise<{ networksDeleted: string[] }> {
    const result = await this.docker.pruneNetworks({});
    return {
      networksDeleted: (result as { NetworksDeleted?: string[] }).NetworksDeleted ?? [],
    };
  }

  /**
   * Blocks until the container exits, returning the exit code.
   */
  async waitContainer(
    containerId: string,
    condition: "not-running" | "next-exit" | "removed" = "not-running",
  ): Promise<{ statusCode: number }> {
    const container = this.docker.getContainer(containerId);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await container.wait({ condition });
    return { statusCode: (result as { StatusCode: number }).StatusCode };
  }

  /**
   * Tags an image with a new repository name and optional tag.
   */
  async tagImage(
    imageId: string,
    repo: string,
    tag?: string,
  ): Promise<void> {
    const image = this.docker.getImage(imageId);
    await image.tag({ repo, tag });
  }

  /**
   * Gets image metadata including size, labels, architecture.
   */
  async inspectImage(imageId: string): Promise<ImageInspect> {
    const image = this.docker.getImage(imageId);
    const info = await image.inspect();
    return mapImageInspect(info);
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

// ─── Container Mapping Helpers ──────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */

function mapContainerListInfo(raw: any): ContainerListInfo {
  return {
    id: raw.Id,
    names: raw.Names ?? [],
    image: raw.Image ?? "",
    imageId: raw.ImageID ?? "",
    state: raw.State ?? "",
    status: raw.Status ?? "",
    labels: raw.Labels ?? {},
    ports: (raw.Ports ?? []).map((p: any) => ({
      privatePort: p.PrivatePort,
      publicPort: p.PublicPort,
      type: p.Type,
    })),
    created: raw.Created ?? 0,
    networkMode: raw.HostConfig?.NetworkMode ?? "",
  };
}

function mapContainerInspect(raw: any): ContainerInspect {
  const state = raw.State ?? {};
  const config = raw.Config ?? {};
  const hostConfig = raw.HostConfig ?? {};
  const netSettings = raw.NetworkSettings ?? {};

  return {
    id: raw.Id ?? "",
    name: (raw.Name ?? "").replace(/^\//, ""),
    state: {
      status: state.Status ?? "",
      running: state.Running ?? false,
      paused: state.Paused ?? false,
      restarting: state.Restarting ?? false,
      exitCode: state.ExitCode ?? 0,
      startedAt: state.StartedAt ?? "",
      finishedAt: state.FinishedAt ?? "",
      health: state.Health
        ? {
            status: state.Health.Status ?? "",
            failingStreak: state.Health.FailingStreak ?? 0,
          }
        : undefined,
    },
    image: raw.Image ?? "",
    config: {
      env: config.Env ?? [],
      cmd: config.Cmd ?? [],
      labels: config.Labels ?? {},
      exposedPorts: Object.keys(config.ExposedPorts ?? {}),
      workingDir: config.WorkingDir ?? "",
    },
    hostConfig: {
      memory: hostConfig.Memory ?? 0,
      cpuQuota: hostConfig.CpuQuota ?? 0,
      pidsLimit: hostConfig.PidsLimit ?? 0,
      networkMode: hostConfig.NetworkMode ?? "",
      restartPolicy: {
        name: hostConfig.RestartPolicy?.Name ?? "",
        maximumRetryCount:
          hostConfig.RestartPolicy?.MaximumRetryCount ?? 0,
      },
    },
    networkSettings: {
      ports: Object.fromEntries(
        Object.entries(netSettings.Ports ?? {}).map(
          ([key, bindings]: [string, any]) => [
            key,
            (bindings ?? []).map((b: any) => ({
              hostIp: b.HostIp ?? "",
              hostPort: b.HostPort ?? "",
            })),
          ],
        ),
      ),
      networks: Object.fromEntries(
        Object.entries(netSettings.Networks ?? {}).map(
          ([key, net]: [string, any]) => [
            key,
            {
              ipAddress: net.IPAddress ?? "",
              gateway: net.Gateway ?? "",
              networkId: net.NetworkID ?? "",
            },
          ],
        ),
      ),
    },
    mounts: (raw.Mounts ?? []).map((m: any) => ({
      type: m.Type ?? "",
      source: m.Source ?? "",
      destination: m.Destination ?? "",
      rw: m.RW ?? false,
    })),
    created: raw.Created ?? "",
  };
}

// ─── Image Mapping Helpers ──────────────────────────────────────────────────

function mapImageListInfo(raw: any): ImageListInfo {
  return {
    id: raw.Id ?? "",
    repoTags: raw.RepoTags ?? [],
    created: raw.Created ?? 0,
    size: raw.Size ?? 0,
    labels: raw.Labels ?? {},
  };
}

function mapImageInspect(raw: any): ImageInspect {
  const config = raw.Config ?? {};
  const hc = config.Healthcheck;
  return {
    id: raw.Id ?? "",
    repoTags: raw.RepoTags ?? [],
    created: raw.Created ?? "",
    size: raw.Size ?? 0,
    architecture: raw.Architecture ?? "",
    os: raw.Os ?? "",
    config: {
      env: config.Env ?? [],
      cmd: config.Cmd ?? [],
      labels: config.Labels ?? {},
      exposedPorts: Object.keys(config.ExposedPorts ?? {}),
      workingDir: config.WorkingDir ?? "",
      healthcheck: hc
        ? {
            test: hc.Test ?? [],
            interval: hc.Interval,
            timeout: hc.Timeout,
            retries: hc.Retries,
          }
        : undefined,
    },
  };
}

// ─── Network Mapping Helpers ────────────────────────────────────────────────

function mapNetworkListInfo(raw: any): NetworkListInfo {
  return {
    id: raw.Id ?? "",
    name: raw.Name ?? "",
    driver: raw.Driver ?? "",
    scope: raw.Scope ?? "",
    internal: raw.Internal ?? false,
    labels: raw.Labels ?? {},
    containers: Object.fromEntries(
      Object.entries(raw.Containers ?? {}).map(
        ([id, c]: [string, any]) => [
          id,
          {
            name: c.Name ?? "",
            ipv4Address: c.IPv4Address ?? "",
          },
        ],
      ),
    ),
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
