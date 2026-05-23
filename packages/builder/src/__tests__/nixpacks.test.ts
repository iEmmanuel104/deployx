import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecFile, mockMkdtemp, mockRename, mockRm, mockAccess } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockMkdtemp: vi.fn(),
  mockRename: vi.fn(),
  mockRm: vi.fn(),
  mockAccess: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));
vi.mock("node:util", () => ({
  promisify: () => mockExecFile,
}));
vi.mock("node:fs/promises", () => ({
  mkdtemp: mockMkdtemp,
  rename: mockRename,
  rm: mockRm,
  access: mockAccess,
}));

import { buildWithNixpacks } from "../nixpacks.js";

describe("buildWithNixpacks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecFile.mockResolvedValue({
      stdout: "Successfully generated Dockerfile",
      stderr: "",
    });
    mockMkdtemp.mockResolvedValue("/tmp/deployx-nixpacks-test-out");
    mockAccess.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);
    mockRm.mockResolvedValue(undefined);
  });

  it("calls nixpacks with --out flag to generate Dockerfile (no docker build)", async () => {
    await buildWithNixpacks({
      sourceDir: "/builds/myapp-abc",
      imageTag: "deployx/myapp:v1",
      buildType: "nixpacks",
      noCache: false,
    });

    const args = mockExecFile.mock.calls[0]![1] as string[];
    expect(mockExecFile.mock.calls[0]![0]).toBe("nixpacks");
    expect(args[0]).toBe("build");
    expect(args[1]).toBe("/builds/myapp-abc");
    expect(args).toContain("--out");
    expect(args[args.indexOf("--out") + 1]).toBe("/tmp/deployx-nixpacks-test-out");
    // CRITICAL: no --name flag — that would trigger the buildx shellout
    expect(args).not.toContain("--name");
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

  it("returns NixpacksGenerateResult on success", async () => {
    mockExecFile.mockResolvedValue({
      stdout: "Dockerfile generated",
      stderr: "warning: something",
    });

    const result = await buildWithNixpacks({
      sourceDir: "/builds/myapp",
      imageTag: "deployx/myapp:v1",
      buildType: "nixpacks",
      noCache: false,
    });

    expect(result.contextDir).toBe("/builds/myapp");
    expect(result.dockerfile).toBe(".nixpacks/Dockerfile");
    expect(result.buildLog).toContain("Dockerfile generated");
    expect(result.buildLog).toContain("warning: something");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("throws NixpacksBuildError on nixpacks failure", async () => {
    const error = Object.assign(new Error("exit code 1"), {
      stdout: "Partial output",
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

  it("throws NixpacksBuildError when .nixpacks directory is missing from out dir", async () => {
    mockAccess.mockRejectedValue(new Error("ENOENT"));
    await expect(
      buildWithNixpacks({
        sourceDir: "/builds/myapp",
        imageTag: "deployx/myapp:v1",
        buildType: "nixpacks",
        noCache: false,
      }),
    ).rejects.toThrow("did not produce a .nixpacks/ directory");
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
