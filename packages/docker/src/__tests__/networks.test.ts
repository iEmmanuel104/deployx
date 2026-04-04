import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDocker } from "./setup.js";

import { DockerClient } from "../index.js";

let mockDocker: ReturnType<typeof createMockDocker>;

vi.mock("dockerode", () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return mockDocker;
    }),
  };
});

describe("DockerClient — Network Operations", () => {
  let client: DockerClient;

  beforeEach(() => {
    mockDocker = createMockDocker();
    client = new DockerClient({ host: "localhost", port: 2375 });
  });

  describe("listNetworks", () => {
    it("lists networks without filters", async () => {
      const result = await client.listNetworks();

      expect(mockDocker.listNetworks).toHaveBeenCalledWith({
        filters: {},
      });
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("test-network");
      expect(result[0]!.driver).toBe("bridge");
    });

    it("passes label filters", async () => {
      await client.listNetworks({
        labels: { "deployx.project": "myapp" },
      });

      expect(mockDocker.listNetworks).toHaveBeenCalledWith({
        filters: { label: ["deployx.project=myapp"] },
      });
    });

    it("passes name filters", async () => {
      await client.listNetworks({ names: ["proxy-network"] });

      expect(mockDocker.listNetworks).toHaveBeenCalledWith({
        filters: { name: ["proxy-network"] },
      });
    });

    it("maps container info within networks", async () => {
      const result = await client.listNetworks();
      const net = result[0]!;

      expect(net.containers["abc123"]).toEqual({
        name: "test-container",
        ipv4Address: "172.17.0.2/16",
      });
    });
  });

  describe("removeNetwork", () => {
    it("removes network by ID", async () => {
      await client.removeNetwork("net123");

      expect(mockDocker.getNetwork).toHaveBeenCalledWith("net123");
      const network = mockDocker.getNetwork("net123");
      expect(network.remove).toHaveBeenCalled();
    });
  });
});
