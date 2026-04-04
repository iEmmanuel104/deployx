import { vi } from "vitest";

// ─── Mock Container ────────────────────────────────────────────────────────

export interface MockContainer {
  id: string;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  restart: ReturnType<typeof vi.fn>;
  inspect: ReturnType<typeof vi.fn>;
  stats: ReturnType<typeof vi.fn>;
  logs: ReturnType<typeof vi.fn>;
  wait: ReturnType<typeof vi.fn>;
}

export function createMockContainer(id = "abc123"): MockContainer {
  return {
    id,
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(undefined),
    inspect: vi.fn().mockResolvedValue({
      Id: id,
      Name: "/test-container",
      State: {
        Status: "running",
        Running: true,
        Paused: false,
        Restarting: false,
        ExitCode: 0,
        StartedAt: "2026-01-01T00:00:00.000Z",
        FinishedAt: "0001-01-01T00:00:00Z",
        Health: { Status: "healthy", FailingStreak: 0 },
      },
      Image: "sha256:abc",
      Config: {
        Env: ["NODE_ENV=production"],
        Cmd: ["node", "server.js"],
        Labels: { app: "test" },
        ExposedPorts: { "3000/tcp": {} },
        WorkingDir: "/app",
      },
      HostConfig: {
        Memory: 536870912,
        CpuQuota: 100000,
        PidsLimit: 256,
        NetworkMode: "bridge",
        RestartPolicy: { Name: "unless-stopped", MaximumRetryCount: 0 },
      },
      NetworkSettings: {
        Ports: {
          "3000/tcp": [{ HostIp: "0.0.0.0", HostPort: "3000" }],
        },
        Networks: {
          bridge: {
            IPAddress: "172.17.0.2",
            Gateway: "172.17.0.1",
            NetworkID: "net123",
          },
        },
      },
      Mounts: [
        {
          Type: "bind",
          Source: "/host/data",
          Destination: "/data",
          RW: true,
        },
      ],
      Created: "2026-01-01T00:00:00.000Z",
    }),
    stats: vi.fn().mockResolvedValue({
      read: "2026-01-01T00:00:00.000Z",
      cpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 1000, online_cpus: 2 },
      precpu_stats: { cpu_usage: { total_usage: 50 }, system_cpu_usage: 500 },
      memory_stats: { usage: 52428800, limit: 536870912 },
      networks: { eth0: { rx_bytes: 1024, tx_bytes: 2048 } },
      blkio_stats: { io_service_bytes_recursive: [] },
    }),
    logs: vi.fn().mockResolvedValue(Buffer.from("test log output")),
    wait: vi.fn().mockResolvedValue({ StatusCode: 0 }),
  };
}

// ─── Mock Image ─────────────────────────────────────────────────────────────

export interface MockImage {
  remove: ReturnType<typeof vi.fn>;
  inspect: ReturnType<typeof vi.fn>;
  tag: ReturnType<typeof vi.fn>;
}

export function createMockImage(): MockImage {
  return {
    remove: vi.fn().mockResolvedValue(undefined),
    inspect: vi.fn().mockResolvedValue({
      Id: "sha256:abc123",
      RepoTags: ["myapp:latest"],
      Created: "2026-01-01T00:00:00.000Z",
      Size: 104857600,
      Architecture: "amd64",
      Os: "linux",
      Config: {
        Env: ["NODE_ENV=production"],
        Cmd: ["node", "server.js"],
        Labels: { app: "test" },
        ExposedPorts: { "3000/tcp": {} },
        WorkingDir: "/app",
      },
    }),
    tag: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── Mock Network ───────────────────────────────────────────────────────────

export interface MockNetwork {
  id: string;
  inspect: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

export function createMockNetwork(id = "net123"): MockNetwork {
  return {
    id,
    inspect: vi.fn().mockResolvedValue({
      Id: id,
      Name: "test-network",
      Driver: "bridge",
      Scope: "local",
      Internal: false,
      Labels: {},
      Containers: {
        abc123: { Name: "test-container", IPv4Address: "172.17.0.2/16" },
      },
    }),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── Mock Modem ─────────────────────────────────────────────────────────────

export interface MockModem {
  followProgress: ReturnType<typeof vi.fn>;
}

export function createMockModem(): MockModem {
  return {
    followProgress: vi.fn().mockImplementation(
      (
        _stream: unknown,
        onFinished: (err: Error | null, output?: unknown[]) => void,
        _onProgress?: (event: unknown) => void,
      ) => {
        onFinished(null, []);
      },
    ),
  };
}

// ─── Mock Docker Instance ───────────────────────────────────────────────────

export interface MockDockerInstance {
  createContainer: ReturnType<typeof vi.fn>;
  getContainer: ReturnType<typeof vi.fn>;
  listContainers: ReturnType<typeof vi.fn>;
  buildImage: ReturnType<typeof vi.fn>;
  pull: ReturnType<typeof vi.fn>;
  getImage: ReturnType<typeof vi.fn>;
  listImages: ReturnType<typeof vi.fn>;
  pruneImages: ReturnType<typeof vi.fn>;
  createNetwork: ReturnType<typeof vi.fn>;
  getNetwork: ReturnType<typeof vi.fn>;
  listNetworks: ReturnType<typeof vi.fn>;
  pruneNetworks: ReturnType<typeof vi.fn>;
  getEvents: ReturnType<typeof vi.fn>;
  ping: ReturnType<typeof vi.fn>;
  modem: MockModem;
}

export function createMockDocker(): MockDockerInstance {
  const mockContainer = createMockContainer();
  const mockImage = createMockImage();
  const mockNetwork = createMockNetwork();
  const mockModem = createMockModem();

  return {
    createContainer: vi.fn().mockResolvedValue(mockContainer),
    getContainer: vi.fn().mockReturnValue(mockContainer),
    listContainers: vi.fn().mockResolvedValue([
      {
        Id: "abc123",
        Names: ["/test-container"],
        Image: "myapp:latest",
        ImageID: "sha256:abc",
        State: "running",
        Status: "Up 2 hours",
        Labels: { app: "test" },
        Ports: [{ PrivatePort: 3000, PublicPort: 3000, Type: "tcp" }],
        Created: 1704067200,
        HostConfig: { NetworkMode: "bridge" },
      },
    ]),
    buildImage: vi.fn().mockResolvedValue({ pipe: vi.fn() }),
    pull: vi.fn().mockResolvedValue({ pipe: vi.fn() }),
    getImage: vi.fn().mockReturnValue(mockImage),
    listImages: vi.fn().mockResolvedValue([
      {
        Id: "sha256:abc123",
        RepoTags: ["myapp:latest"],
        Created: 1704067200,
        Size: 104857600,
        Labels: { app: "test" },
      },
    ]),
    pruneImages: vi.fn().mockResolvedValue({
      ImagesDeleted: [{ Deleted: "sha256:old" }],
      SpaceReclaimed: 52428800,
    }),
    createNetwork: vi.fn().mockResolvedValue(mockNetwork),
    getNetwork: vi.fn().mockReturnValue(mockNetwork),
    listNetworks: vi.fn().mockResolvedValue([
      {
        Id: "net123",
        Name: "test-network",
        Driver: "bridge",
        Scope: "local",
        Internal: false,
        Labels: {},
        Containers: {
          abc123: { Name: "test-container", IPv4Address: "172.17.0.2/16" },
        },
      },
    ]),
    pruneNetworks: vi.fn().mockResolvedValue({
      NetworksDeleted: ["old-network"],
    }),
    getEvents: vi.fn().mockResolvedValue({ pipe: vi.fn() }),
    ping: vi.fn().mockResolvedValue("OK"),
    modem: mockModem,
  };
}
