import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDocker, createMockImage } from "./setup.js";
import { DockerClient } from "../index.js";

let mockDocker: ReturnType<typeof createMockDocker>;

vi.mock("dockerode", () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return mockDocker;
    }),
  };
});

describe("DockerClient — Maintenance Operations", () => {
  let client: DockerClient;

  beforeEach(() => {
    mockDocker = createMockDocker();
    client = new DockerClient({ host: "localhost", port: 2375 });
  });

  describe("pruneImages", () => {
    it("returns pruned image count and space reclaimed", async () => {
      const result = await client.pruneImages();

      expect(mockDocker.pruneImages).toHaveBeenCalledWith({});
      expect(result.imagesDeleted).toBe(1);
      expect(result.spaceReclaimed).toBe(52428800);
    });
  });

  describe("pruneNetworks", () => {
    it("returns deleted network names", async () => {
      const result = await client.pruneNetworks();

      expect(mockDocker.pruneNetworks).toHaveBeenCalledWith({});
      expect(result.networksDeleted).toEqual(["old-network"]);
    });
  });

  describe("waitContainer", () => {
    it("waits for container with default condition", async () => {
      const result = await client.waitContainer("abc123");

      const container = mockDocker.getContainer("abc123");
      expect(container.wait).toHaveBeenCalledWith({
        condition: "not-running",
      });
      expect(result.statusCode).toBe(0);
    });

    it("waits with custom condition", async () => {
      await client.waitContainer("abc123", "next-exit");

      const container = mockDocker.getContainer("abc123");
      expect(container.wait).toHaveBeenCalledWith({
        condition: "next-exit",
      });
    });
  });

  describe("tagImage", () => {
    it("tags an image with repo and tag", async () => {
      await client.tagImage("sha256:abc", "myapp", "v1.0");

      expect(mockDocker.getImage).toHaveBeenCalledWith("sha256:abc");
      const image = mockDocker.getImage("sha256:abc");
      expect(image.tag).toHaveBeenCalledWith({
        repo: "myapp",
        tag: "v1.0",
      });
    });

    it("tags without explicit tag", async () => {
      await client.tagImage("sha256:abc", "myapp");

      const image = mockDocker.getImage("sha256:abc");
      expect(image.tag).toHaveBeenCalledWith({
        repo: "myapp",
        tag: undefined,
      });
    });
  });

  describe("inspectImage", () => {
    it("returns mapped image inspect info", async () => {
      const result = await client.inspectImage("sha256:abc123");

      expect(mockDocker.getImage).toHaveBeenCalledWith("sha256:abc123");
      expect(result.id).toBe("sha256:abc123");
      expect(result.repoTags).toEqual(["myapp:latest"]);
      expect(result.architecture).toBe("amd64");
      expect(result.os).toBe("linux");
      expect(result.config.labels).toEqual({ app: "test" });
    });
  });
});
