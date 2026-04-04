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

describe("DockerClient — Image Operations", () => {
  let client: DockerClient;

  beforeEach(() => {
    mockDocker = createMockDocker();
    client = new DockerClient({ host: "localhost", port: 2375 });
  });

  describe("pullImage", () => {
    it("pulls an image and resolves with the repoTag", async () => {
      const result = await client.pullImage("node:22-alpine");

      expect(mockDocker.pull).toHaveBeenCalledWith("node:22-alpine", {});
      expect(result).toBe("node:22-alpine");
    });

    it("invokes onProgress callback", async () => {
      const progressEvents: unknown[] = [];
      const testEvent = { status: "Pulling layer", id: "abc123" };

      mockDocker.modem.followProgress.mockImplementation(
        (
          _stream: unknown,
          onFinished: (err: Error | null) => void,
          onProgress: (event: unknown) => void,
        ) => {
          onProgress(testEvent);
          onFinished(null);
        },
      );

      await client.pullImage("node:22-alpine", (event) => {
        progressEvents.push(event);
      });

      expect(progressEvents).toEqual([testEvent]);
    });

    it("rejects on pull error", async () => {
      mockDocker.modem.followProgress.mockImplementation(
        (
          _stream: unknown,
          onFinished: (err: Error | null) => void,
        ) => {
          onFinished(new Error("pull failed"));
        },
      );

      await expect(client.pullImage("bad:image")).rejects.toThrow(
        "pull failed",
      );
    });
  });

  describe("listImages", () => {
    it("lists images without filters", async () => {
      const result = await client.listImages();

      expect(mockDocker.listImages).toHaveBeenCalledWith({
        all: false,
        filters: {},
      });
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("sha256:abc123");
      expect(result[0]!.repoTags).toEqual(["myapp:latest"]);
    });

    it("passes label filters", async () => {
      await client.listImages({ labels: { app: "test" } });

      expect(mockDocker.listImages).toHaveBeenCalledWith({
        all: false,
        filters: { label: ["app=test"] },
      });
    });
  });

  describe("removeImage", () => {
    it("removes image without force", async () => {
      await client.removeImage("sha256:abc123");

      expect(mockDocker.getImage).toHaveBeenCalledWith("sha256:abc123");
      const image = mockDocker.getImage("sha256:abc123");
      expect(image.remove).toHaveBeenCalledWith({ force: false });
    });

    it("removes image with force", async () => {
      await client.removeImage("sha256:abc123", true);

      const image = mockDocker.getImage("sha256:abc123");
      expect(image.remove).toHaveBeenCalledWith({ force: true });
    });
  });
});
