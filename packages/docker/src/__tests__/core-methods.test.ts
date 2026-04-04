import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";
import { createMockDocker, createMockContainer } from "./setup.js";
import { DockerClient, SECURE_CONTAINER_DEFAULTS } from "../index.js";

let mockDocker: ReturnType<typeof createMockDocker>;

vi.mock("dockerode", () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return mockDocker;
    }),
  };
});

describe("DockerClient — Security Defaults Enforcement", () => {
  let client: DockerClient;

  beforeEach(() => {
    mockDocker = createMockDocker();
    client = new DockerClient({ host: "localhost", port: 2375 });
  });

  it("enforces Privileged: false", async () => {
    await client.createAndStartContainer({
      name: "test",
      image: "myapp:latest",
    });

    const opts = mockDocker.createContainer.mock.calls[0]![0];
    expect(opts.HostConfig.Privileged).toBe(false);
  });

  it("enforces CapDrop: ALL", async () => {
    await client.createAndStartContainer({
      name: "test",
      image: "myapp:latest",
    });

    const opts = mockDocker.createContainer.mock.calls[0]![0];
    expect(opts.HostConfig.CapDrop).toEqual(["ALL"]);
  });

  it("enforces SecurityOpt with correct format", async () => {
    await client.createAndStartContainer({
      name: "test",
      image: "myapp:latest",
    });

    const opts = mockDocker.createContainer.mock.calls[0]![0];
    expect(opts.HostConfig.SecurityOpt).toContain("no-new-privileges:true");
    expect(opts.HostConfig.SecurityOpt).toContain("apparmor=docker-default");
    // Verify no incorrectly formatted entries
    for (const opt of opts.HostConfig.SecurityOpt) {
      if (opt.startsWith("seccomp")) {
        expect(opt).not.toContain(":");
      }
      if (opt.startsWith("apparmor")) {
        expect(opt).toContain("=");
      }
    }
  });

  it("enforces PidsLimit: 256 by default", async () => {
    await client.createAndStartContainer({
      name: "test",
      image: "myapp:latest",
    });

    const opts = mockDocker.createContainer.mock.calls[0]![0];
    expect(opts.HostConfig.PidsLimit).toBe(256);
  });

  it("enforces User: 1000:1000 by default", async () => {
    await client.createAndStartContainer({
      name: "test",
      image: "myapp:latest",
    });

    const opts = mockDocker.createContainer.mock.calls[0]![0];
    expect(opts.User).toBe("1000:1000");
  });

  it("enforces default Memory limit", async () => {
    await client.createAndStartContainer({
      name: "test",
      image: "myapp:latest",
    });

    const opts = mockDocker.createContainer.mock.calls[0]![0];
    expect(opts.HostConfig.Memory).toBe(SECURE_CONTAINER_DEFAULTS.Memory);
  });

  it("enforces default CpuQuota", async () => {
    await client.createAndStartContainer({
      name: "test",
      image: "myapp:latest",
    });

    const opts = mockDocker.createContainer.mock.calls[0]![0];
    expect(opts.HostConfig.CpuQuota).toBe(SECURE_CONTAINER_DEFAULTS.CpuQuota);
  });

  it("allows overriding Memory and CpuQuota but NOT security opts", async () => {
    await client.createAndStartContainer({
      name: "test",
      image: "myapp:latest",
      memory: 1024 * 1024 * 1024,
      cpuQuota: 200_000,
    });

    const opts = mockDocker.createContainer.mock.calls[0]![0];
    expect(opts.HostConfig.Memory).toBe(1024 * 1024 * 1024);
    expect(opts.HostConfig.CpuQuota).toBe(200_000);
    // Security opts still enforced
    expect(opts.HostConfig.Privileged).toBe(false);
    expect(opts.HostConfig.CapDrop).toEqual(["ALL"]);
  });

  it("starts the container after creation", async () => {
    const containerId = await client.createAndStartContainer({
      name: "test",
      image: "myapp:latest",
    });

    expect(containerId).toBeDefined();
    const container = mockDocker.createContainer.mock.results[0]!.value;
    expect((await container).start).toHaveBeenCalled();
  });
});

describe("DockerClient — Stop & Remove", () => {
  let client: DockerClient;

  beforeEach(() => {
    mockDocker = createMockDocker();
    client = new DockerClient({ host: "localhost", port: 2375 });
  });

  describe("stopContainer", () => {
    it("stops with default timeout", async () => {
      await client.stopContainer("abc123");

      expect(mockDocker.getContainer).toHaveBeenCalledWith("abc123");
      const container = mockDocker.getContainer("abc123");
      expect(container.stop).toHaveBeenCalledWith({ t: 10 });
    });

    it("stops with custom timeout", async () => {
      await client.stopContainer("abc123", 30);

      const container = mockDocker.getContainer("abc123");
      expect(container.stop).toHaveBeenCalledWith({ t: 30 });
    });
  });

  describe("removeContainer", () => {
    it("force removes container with volumes", async () => {
      await client.removeContainer("abc123");

      expect(mockDocker.getContainer).toHaveBeenCalledWith("abc123");
      const container = mockDocker.getContainer("abc123");
      expect(container.remove).toHaveBeenCalledWith({ force: true, v: true });
    });
  });
});

describe("DockerClient — Stats", () => {
  let client: DockerClient;

  beforeEach(() => {
    mockDocker = createMockDocker();
    client = new DockerClient({ host: "localhost", port: 2375 });
  });

  describe("getContainerStats", () => {
    it("returns parsed stats snapshot", async () => {
      const stats = await client.getContainerStats("abc123");

      expect(mockDocker.getContainer).toHaveBeenCalledWith("abc123");
      expect(stats.containerId).toBe("abc123");
      expect(typeof stats.cpuPct).toBe("number");
      expect(typeof stats.memMb).toBe("number");
      expect(typeof stats.memLimitMb).toBe("number");
      expect(typeof stats.netRxKb).toBe("number");
      expect(typeof stats.netTxKb).toBe("number");
      expect(typeof stats.ts).toBe("string");
    });
  });
});

describe("DockerClient — Logs", () => {
  let client: DockerClient;

  beforeEach(() => {
    mockDocker = createMockDocker();
    client = new DockerClient({ host: "localhost", port: 2375 });
  });

  describe("getContainerLogs", () => {
    it("returns readable stream for non-follow mode", async () => {
      const stream = await client.getContainerLogs("abc123");

      expect(mockDocker.getContainer).toHaveBeenCalledWith("abc123");
      expect(stream).toBeDefined();
      expect(typeof stream.on).toBe("function");
    });

    it("passes options correctly", async () => {
      await client.getContainerLogs("abc123", {
        stdout: true,
        stderr: false,
        tail: 100,
        timestamps: true,
      });

      const container = mockDocker.getContainer("abc123");
      expect(container.logs).toHaveBeenCalledWith(
        expect.objectContaining({
          stdout: true,
          stderr: false,
          tail: 100,
          timestamps: true,
          follow: false,
        }),
      );
    });
  });
});

describe("DockerClient — Network Management", () => {
  let client: DockerClient;

  beforeEach(() => {
    mockDocker = createMockDocker();
    client = new DockerClient({ host: "localhost", port: 2375 });
  });

  describe("createNetwork", () => {
    it("creates a bridge network", async () => {
      const id = await client.createNetwork("test-net");

      expect(mockDocker.createNetwork).toHaveBeenCalledWith(
        expect.objectContaining({
          Name: "test-net",
          Driver: "bridge",
          Internal: false,
          CheckDuplicate: true,
        }),
      );
      expect(id).toBeDefined();
    });

    it("creates internal network when specified", async () => {
      await client.createNetwork("internal-net", true);

      expect(mockDocker.createNetwork).toHaveBeenCalledWith(
        expect.objectContaining({
          Internal: true,
        }),
      );
    });
  });

  describe("connectToNetwork", () => {
    it("connects container to network", async () => {
      await client.connectToNetwork("proxy-net", "abc123");

      expect(mockDocker.getNetwork).toHaveBeenCalledWith("proxy-net");
      const network = mockDocker.getNetwork("proxy-net");
      expect(network.connect).toHaveBeenCalledWith({ Container: "abc123" });
    });
  });

  describe("disconnectFromNetwork", () => {
    it("disconnects container from network", async () => {
      await client.disconnectFromNetwork("proxy-net", "abc123");

      expect(mockDocker.getNetwork).toHaveBeenCalledWith("proxy-net");
      const network = mockDocker.getNetwork("proxy-net");
      expect(network.disconnect).toHaveBeenCalledWith({
        Container: "abc123",
      });
    });
  });
});

describe("DockerClient — Ping", () => {
  let client: DockerClient;

  beforeEach(() => {
    mockDocker = createMockDocker();
    client = new DockerClient({ host: "localhost", port: 2375 });
  });

  it("returns true when daemon is reachable", async () => {
    const result = await client.ping();
    expect(result).toBe(true);
    expect(mockDocker.ping).toHaveBeenCalled();
  });

  it("returns false when daemon is unreachable", async () => {
    mockDocker.ping.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await client.ping();
    expect(result).toBe(false);
  });
});

describe("DockerClient — Build Image", () => {
  let client: DockerClient;

  beforeEach(() => {
    mockDocker = createMockDocker();
    mockDocker.modem.followProgress.mockImplementation(
      (
        _stream: unknown,
        onFinished: (err: Error | null) => void,
        onProgress?: (event: unknown) => void,
      ) => {
        onProgress?.({ aux: { ID: "sha256:built123" } });
        onFinished(null);
      },
    );
    client = new DockerClient({ host: "localhost", port: 2375 });
  });

  it("always enforces networkmode: none (not overridable)", async () => {
    const context = Readable.from(Buffer.from(""));

    await client.buildImage(context, { tag: "test:v1" });

    const buildOpts = mockDocker.buildImage.mock.calls[0]![1];
    expect(buildOpts.networkmode).toBe("none");
  });

  it("returns image ID on success", async () => {
    const context = Readable.from(Buffer.from(""));

    const imageId = await client.buildImage(context, { tag: "test:v1" });

    expect(imageId).toBe("sha256:built123");
  });

  it("rejects when build fails", async () => {
    mockDocker.modem.followProgress.mockImplementation(
      (
        _stream: unknown,
        onFinished: (err: Error | null) => void,
      ) => {
        onFinished(new Error("build failed"));
      },
    );

    const context = Readable.from(Buffer.from(""));
    await expect(
      client.buildImage(context, { tag: "test:v1" }),
    ).rejects.toThrow("build failed");
  });
});
