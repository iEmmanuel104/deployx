import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));
vi.mock("node:util", () => ({
  promisify: () => mockExecFile,
}));

import { buildWithNixpacks } from "../nixpacks.js";

describe("buildWithNixpacks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecFile.mockResolvedValue({
      stdout: "Successfully built image",
      stderr: "",
    });
  });

  it("calls nixpacks with correct base args", async () => {
    await buildWithNixpacks({
      sourceDir: "/builds/myapp-abc",
      imageTag: "deployx/myapp:v1",
      buildType: "nixpacks",
      noCache: false,
    });

    expect(mockExecFile).toHaveBeenCalledWith(
      "nixpacks",
      ["build", "/builds/myapp-abc", "--name", "deployx/myapp:v1"],
      expect.objectContaining({ timeout: 600_000 }),
    );
  });

  it("adds --build-cmd when provided", async () => {
    await buildWithNixpacks({
      sourceDir: "/builds/myapp",
      imageTag: "deployx/myapp:v1",
      buildType: "nixpacks",
      buildCmd: "npm run build",
      noCache: false,
    });

    const args = mockExecFile.mock.calls[0]![1] as string[];
    expect(args).toContain("--build-cmd");
    expect(args[args.indexOf("--build-cmd") + 1]).toBe("npm run build");
  });

  it("adds --start-cmd when provided", async () => {
    await buildWithNixpacks({
      sourceDir: "/builds/myapp",
      imageTag: "deployx/myapp:v1",
      buildType: "nixpacks",
      startCmd: "node server.js",
      noCache: false,
    });

    const args = mockExecFile.mock.calls[0]![1] as string[];
    expect(args).toContain("--start-cmd");
    expect(args[args.indexOf("--start-cmd") + 1]).toBe("node server.js");
  });

  it("adds --no-cache when noCache is true", async () => {
    await buildWithNixpacks({
      sourceDir: "/builds/myapp",
      imageTag: "deployx/myapp:v1",
      buildType: "nixpacks",
      noCache: true,
    });

    const args = mockExecFile.mock.calls[0]![1] as string[];
    expect(args).toContain("--no-cache");
  });

  it("adds --env flags for each env var", async () => {
    await buildWithNixpacks({
      sourceDir: "/builds/myapp",
      imageTag: "deployx/myapp:v1",
      buildType: "nixpacks",
      envVars: { NODE_ENV: "production", API_URL: "https://api.test" },
      noCache: false,
    });

    const args = mockExecFile.mock.calls[0]![1] as string[];
    const envFlags = args.filter(
      (_: string, i: number) => args[i - 1] === "--env",
    );
    expect(envFlags).toContain("NODE_ENV=production");
    expect(envFlags).toContain("API_URL=https://api.test");
  });

  it("returns BuildResult on success", async () => {
    mockExecFile.mockResolvedValue({
      stdout: "Build complete",
      stderr: "warning: something",
    });

    const result = await buildWithNixpacks({
      sourceDir: "/builds/myapp",
      imageTag: "deployx/myapp:v1",
      buildType: "nixpacks",
      noCache: false,
    });

    expect(result.imageTag).toBe("deployx/myapp:v1");
    expect(result.buildLog).toContain("Build complete");
    expect(result.buildLog).toContain("warning: something");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("throws NixpacksBuildError on failure", async () => {
    const error = Object.assign(new Error("exit code 1"), {
      stdout: "Partial build output",
      stderr: "Error: build failed",
    });
    mockExecFile.mockRejectedValue(error);

    await expect(
      buildWithNixpacks({
        sourceDir: "/builds/myapp",
        imageTag: "deployx/myapp:v1",
        buildType: "nixpacks",
        noCache: false,
      }),
    ).rejects.toThrow("Nixpacks build failed");
  });

  it("rejects metachar commands before calling nixpacks", async () => {
    await expect(
      buildWithNixpacks({
        sourceDir: "/builds/myapp",
        imageTag: "deployx/myapp:v1",
        buildType: "nixpacks",
        buildCmd: "npm run build && echo pwned",
        noCache: false,
      }),
    ).rejects.toThrow("forbidden shell metacharacter");

    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("uses custom binary path", async () => {
    await buildWithNixpacks(
      {
        sourceDir: "/builds/myapp",
        imageTag: "deployx/myapp:v1",
        buildType: "nixpacks",
        noCache: false,
      },
      { nixpacksBin: "/usr/local/bin/nixpacks" },
    );

    expect(mockExecFile.mock.calls[0]![0]).toBe("/usr/local/bin/nixpacks");
  });

  it("uses custom timeout", async () => {
    await buildWithNixpacks(
      {
        sourceDir: "/builds/myapp",
        imageTag: "deployx/myapp:v1",
        buildType: "nixpacks",
        noCache: false,
      },
      { timeoutMs: 300_000 },
    );

    expect(mockExecFile.mock.calls[0]![2]).toMatchObject({
      timeout: 300_000,
    });
  });
});
