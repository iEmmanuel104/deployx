import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAccess, mockBuildImage } = vi.hoisted(() => ({
  mockAccess: vi.fn(),
  mockBuildImage: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  access: mockAccess,
}));

vi.mock("../build-context.js", () => ({
  buildImageFromContext: mockBuildImage,
}));

import { buildFromUserDockerfile } from "../dockerfile.js";
import { BuildError } from "../errors.js";

describe("buildFromUserDockerfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccess.mockResolvedValue(undefined);
    mockBuildImage.mockResolvedValue({
      imageId: "sha256:abc",
      imageTag: "deployx/app:v1",
      durationMs: 1234,
    });
  });

  it("forwards contextDir, dockerfile, tag, envVars, labels to buildImageFromContext", async () => {
    await buildFromUserDockerfile({
      contextDir: "/builds/myapp",
      dockerfilePath: "Dockerfile",
      tag: "deployx/app:v1",
      envVars: { NODE_ENV: "production", PORT: "3000" },
      labels: { "deployx.project-id": "p1" },
    });

    expect(mockBuildImage).toHaveBeenCalledTimes(1);
    expect(mockBuildImage).toHaveBeenCalledWith({
      contextDir: "/builds/myapp",
      dockerfile: "Dockerfile",
      tag: "deployx/app:v1",
      buildArgs: { NODE_ENV: "production", PORT: "3000" },
      labels: { "deployx.project-id": "p1" },
      dockerClient: undefined,
    });
  });

  it("defaults dockerfile path to 'Dockerfile' when not provided", async () => {
    await buildFromUserDockerfile({
      contextDir: "/builds/myapp",
      tag: "deployx/app:v1",
    });

    const call = mockBuildImage.mock.calls[0]![0] as { dockerfile: string };
    expect(call.dockerfile).toBe("Dockerfile");
  });

  it("supports a custom dockerfile path inside contextDir", async () => {
    await buildFromUserDockerfile({
      contextDir: "/builds/myapp",
      dockerfilePath: "docker/prod.Dockerfile",
      tag: "deployx/app:v1",
    });

    const call = mockBuildImage.mock.calls[0]![0] as { dockerfile: string };
    expect(call.dockerfile).toBe("docker/prod.Dockerfile");
  });

  it("rejects absolute dockerfile paths", async () => {
    await expect(
      buildFromUserDockerfile({
        contextDir: "/builds/myapp",
        dockerfilePath: "/etc/passwd",
        tag: "deployx/app:v1",
      }),
    ).rejects.toBeInstanceOf(BuildError);

    expect(mockBuildImage).not.toHaveBeenCalled();
  });

  it("rejects dockerfile paths that escape contextDir via ..", async () => {
    await expect(
      buildFromUserDockerfile({
        contextDir: "/builds/myapp",
        dockerfilePath: "../../etc/passwd",
        tag: "deployx/app:v1",
      }),
    ).rejects.toBeInstanceOf(BuildError);

    expect(mockBuildImage).not.toHaveBeenCalled();
  });

  it("throws BuildError with DOCKERFILE_NOT_FOUND when the file is missing", async () => {
    mockAccess.mockRejectedValue(new Error("ENOENT"));

    await expect(
      buildFromUserDockerfile({
        contextDir: "/builds/myapp",
        tag: "deployx/app:v1",
      }),
    ).rejects.toMatchObject({
      name: "BuildError",
      code: "DOCKERFILE_NOT_FOUND",
    });

    expect(mockBuildImage).not.toHaveBeenCalled();
  });

  it("returns the BuildImageFromContextResult unchanged", async () => {
    mockBuildImage.mockResolvedValue({
      imageId: "sha256:zzz",
      imageTag: "deployx/app:v2",
      durationMs: 5000,
    });

    const result = await buildFromUserDockerfile({
      contextDir: "/builds/myapp",
      tag: "deployx/app:v2",
    });

    expect(result).toEqual({
      imageId: "sha256:zzz",
      imageTag: "deployx/app:v2",
      durationMs: 5000,
    });
  });

  it("does NOT invoke nixpacks (no execFile, no Dockerfile generation step)", async () => {
    // The dockerfile path must not call any child_process or generation helper.
    // We assert this indirectly by confirming buildImageFromContext is called
    // exactly once with the user-supplied dockerfile path (no .nixpacks/ prefix).
    await buildFromUserDockerfile({
      contextDir: "/builds/myapp",
      dockerfilePath: "Dockerfile",
      tag: "deployx/app:v1",
    });

    const call = mockBuildImage.mock.calls[0]![0] as { dockerfile: string };
    expect(call.dockerfile).toBe("Dockerfile");
    expect(call.dockerfile).not.toContain(".nixpacks");
  });
});
