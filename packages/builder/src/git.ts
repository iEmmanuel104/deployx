import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { GitCloneError } from "./errors.js";

const execFileAsync = promisify(execFile);

const BUILDS_DIR = process.env["DEPLOYX_BUILDS_DIR"] ?? "/builds";

export interface CloneResult {
  /** Path to the cloned source directory */
  dir: string;
  /** HEAD commit SHA of the cloned branch */
  commitSha: string;
}

/**
 * Shallow-clones a git repository into a temporary build directory.
 *
 * Uses execFile (NOT exec) with parameterized arrays to prevent
 * command injection via repo URLs or branch names.
 */
export async function cloneRepo(
  repo: string,
  branch: string,
  projectSlug: string,
): Promise<CloneResult> {
  const destDir = await mkdtemp(join(BUILDS_DIR, `${projectSlug}-`));

  try {
    await execFileAsync(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--branch",
        branch,
        "--single-branch",
        repo,
        destDir,
      ],
      { timeout: 120_000 }, // 2 min clone timeout
    );

    const { stdout } = await execFileAsync(
      "git",
      ["-C", destDir, "rev-parse", "HEAD"],
    );

    return {
      dir: destDir,
      commitSha: stdout.trim(),
    };
  } catch (err) {
    // Attempt cleanup on failure
    await rm(destDir, { recursive: true, force: true }).catch(() => {});
    throw new GitCloneError(
      `Failed to clone ${repo}@${branch}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Removes a build directory after the build is complete.
 */
export async function cleanupBuildDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
