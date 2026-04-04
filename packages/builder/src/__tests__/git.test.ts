import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecFile, mockMkdtemp, mockRm } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockMkdtemp: vi.fn(),
  mockRm: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));
vi.mock("node:util", () => ({
  promisify: () => mockExecFile,
}));
vi.mock("node:fs/promises", () => ({
  mkdtemp: (...args: unknown[]) => mockMkdtemp(...args),
  rm: (...args: unknown[]) => mockRm(...args),
}));

import { cloneRepo, cleanupBuildDir } from "../git.js";

describe("cloneRepo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdtemp.mockResolvedValue("/builds/myapp-abc123");
    mockExecFile
      .mockResolvedValueOnce({ stdout: "", stderr: "" }) // git clone
      .mockResolvedValueOnce({ stdout: "abc123def456\n", stderr: "" }); // git rev-parse
    mockRm.mockResolvedValue(undefined);
  });

  it("clones with correct git args", async () => {
    await cloneRepo("https://github.com/user/repo.git", "main", "myapp");

    const cloneCall = mockExecFile.mock.calls[0]!;
    expect(cloneCall[0]).toBe("git");
    expect(cloneCall[1]).toEqual([
      "clone",
      "--depth",
      "1",
      "--branch",
      "main",
      "--single-branch",
      "https://github.com/user/repo.git",
      "/builds/myapp-abc123",
    ]);
  });

  it("returns dir and commitSha", async () => {
    const result = await cloneRepo(
      "https://github.com/user/repo.git",
      "main",
      "myapp",
    );

    expect(result.dir).toBe("/builds/myapp-abc123");
    expect(result.commitSha).toBe("abc123def456");
  });

  it("gets commit SHA via git rev-parse HEAD", async () => {
    await cloneRepo("https://github.com/user/repo.git", "main", "myapp");

    const revParseCall = mockExecFile.mock.calls[1]!;
    expect(revParseCall[0]).toBe("git");
    expect(revParseCall[1]).toEqual([
      "-C",
      "/builds/myapp-abc123",
      "rev-parse",
      "HEAD",
    ]);
  });

  it("cleans up temp dir on clone failure", async () => {
    mockExecFile
      .mockReset()
      .mockRejectedValueOnce(new Error("clone failed"));

    await expect(
      cloneRepo("https://bad-repo.git", "main", "myapp"),
    ).rejects.toThrow("Failed to clone");

    expect(mockRm).toHaveBeenCalledWith("/builds/myapp-abc123", {
      recursive: true,
      force: true,
    });
  });

  it("throws GitCloneError", async () => {
    mockExecFile.mockReset().mockRejectedValueOnce(new Error("auth failed"));

    try {
      await cloneRepo("https://private-repo.git", "main", "myapp");
    } catch (err) {
      expect((err as Error).name).toBe("GitCloneError");
    }
  });
});

describe("cleanupBuildDir", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRm.mockResolvedValue(undefined);
  });

  it("removes directory recursively", async () => {
    await cleanupBuildDir("/builds/myapp-abc123");

    expect(mockRm).toHaveBeenCalledWith("/builds/myapp-abc123", {
      recursive: true,
      force: true,
    });
  });
});
