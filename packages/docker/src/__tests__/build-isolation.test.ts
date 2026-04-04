import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";
import { createMockDocker } from "./setup.js";
import { DockerClient, SECURE_BUILD_DEFAULTS } from "../index.js";

let mockDocker: ReturnType<typeof createMockDocker>;

vi.mock("dockerode", () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return mockDocker;
    }),
  };
});

describe("DockerClient — Build Isolation", () => {
  let client: DockerClient;

  beforeEach(() => {
    mockDocker = createMockDocker();

    // Make buildImage return a stream that the modem can follow
    mockDocker.buildImage.mockResolvedValue({ pipe: vi.fn() });
    mockDocker.modem.followProgress.mockImplementation(
      (
        _stream: unknown,
        onFinished: (err: Error | null) => void,
        _onProgress?: (event: unknown) => void,
      ) => {
        onFinished(null);
      },
    );

    client = new DockerClient({ host: "localhost", port: 2375 });
  });

  it("enforces default build isolation (networkmode: none)", async () => {
    const context = Readable.from(Buffer.from(""));

    // The build will reject because no image ID is returned,
    // but we can still verify the options passed
    try {
      await client.buildImage(context, { tag: "test:v1" });
    } catch {
      // Expected: "Build completed but no image ID found"
    }

    const buildCall = mockDocker.buildImage.mock.calls[0]!;
    const buildOpts = buildCall[1];

    expect(buildOpts.networkmode).toBe("none");
    expect(buildOpts.memory).toBe(SECURE_BUILD_DEFAULTS.memory);
    expect(buildOpts.cpuquota).toBe(SECURE_BUILD_DEFAULTS.cpuQuota);
  });

  it("allows overriding memory and CPU but NOT networkMode", async () => {
    const context = Readable.from(Buffer.from(""));

    try {
      await client.buildImage(context, {
        tag: "test:v1",
        memory: 2 * 1024 * 1024 * 1024,
        cpuQuota: 200_000,
      });
    } catch {
      // Expected
    }

    const buildOpts = mockDocker.buildImage.mock.calls[0]![1];

    // networkMode is always "none" — non-negotiable security rule
    expect(buildOpts.networkmode).toBe("none");
    expect(buildOpts.memory).toBe(2 * 1024 * 1024 * 1024);
    expect(buildOpts.cpuquota).toBe(200_000);
  });

  it("SECURE_BUILD_DEFAULTS has correct values", () => {
    expect(SECURE_BUILD_DEFAULTS.networkMode).toBe("none");
    expect(SECURE_BUILD_DEFAULTS.memory).toBe(1024 * 1024 * 1024);
    expect(SECURE_BUILD_DEFAULTS.cpuQuota).toBe(100_000);
  });
});
