import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDocker } from "./setup.js";

// Mock dockerode before importing DockerClient
import { DockerClient } from "../index.js";

let mockDocker: ReturnType<typeof createMockDocker>;

vi.mock("dockerode", () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return mockDocker;
    }),
  };
});

describe("DockerClient — Container Discovery", () => {
  let client: DockerClient;

  beforeEach(() => {
    mockDocker = createMockDocker();
    client = new DockerClient({ host: "localhost", port: 2375 });
  });

  describe("listContainers", () => {
    it("lists all containers by default", async () => {
      const result = await client.listContainers();

      expect(mockDocker.listContainers).toHaveBeenCalledWith({
        all: true,
        filters: {},
      });
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("abc123");
      expect(result[0]!.image).toBe("myapp:latest");
      expect(result[0]!.state).toBe("running");
    });

    it("passes label filters correctly", async () => {
      await client.listContainers({
        labels: { app: "myapp", "deployx.project": "" },
      });

      expect(mockDocker.listContainers).toHaveBeenCalledWith({
        all: true,
        filters: {
          label: ["app=myapp", "deployx.project"],
        },
      });
    });

    it("passes status filters correctly", async () => {
      await client.listContainers({
        status: ["running", "exited"],
      });

      expect(mockDocker.listContainers).toHaveBeenCalledWith({
        all: true,
        filters: {
          status: ["running", "exited"],
        },
      });
    });

    it("maps container info correctly", async () => {
      const result = await client.listContainers();
      const c = result[0]!;

      expect(c.names).toEqual(["/test-container"]);
      expect(c.ports).toEqual([
        { privatePort: 3000, publicPort: 3000, type: "tcp" },
      ]);
      expect(c.networkMode).toBe("bridge");
    });
  });

  describe("inspectContainer", () => {
    it("returns mapped container inspect info", async () => {
      const result = await client.inspectContainer("abc123");

      expect(mockDocker.getContainer).toHaveBeenCalledWith("abc123");
      expect(result.id).toBe("abc123");
      expect(result.name).toBe("test-container");
      expect(result.state.running).toBe(true);
      expect(result.state.health?.status).toBe("healthy");
      expect(result.config.labels).toEqual({ app: "test" });
      expect(result.hostConfig.memory).toBe(536870912);
      expect(result.hostConfig.restartPolicy.name).toBe("unless-stopped");
      expect(result.networkSettings.networks["bridge"]!.ipAddress).toBe(
        "172.17.0.2",
      );
      expect(result.mounts).toHaveLength(1);
    });
  });

  describe("restartContainer", () => {
    it("restarts with default timeout", async () => {
      await client.restartContainer("abc123");

      const container = mockDocker.getContainer("abc123");
      expect(container.restart).toHaveBeenCalledWith({ t: 10 });
    });

    it("restarts with custom timeout", async () => {
      await client.restartContainer("abc123", 30);

      const container = mockDocker.getContainer("abc123");
      expect(container.restart).toHaveBeenCalledWith({ t: 30 });
    });
  });
});
