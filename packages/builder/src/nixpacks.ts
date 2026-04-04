import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BuildOptions, BuildResult } from "@deployx/types";
import { validateBuildCommand } from "./validation.js";
import { NixpacksBuildError } from "./errors.js";

const execFileAsync = promisify(execFile);

export interface NixpacksBuilderOpts {
  /** Override the nixpacks binary path. Default: "nixpacks" */
  nixpacksBin?: string;
  /** Max build time in ms. Default: 600_000 (10 min) */
  timeoutMs?: number;
}

/**
 * Builds a project source directory into a Docker image using Nixpacks.
 *
 * Uses execFile (NOT exec) to prevent command injection — arguments are
 * passed as an array, never interpolated into a shell string.
 */
export async function buildWithNixpacks(
  options: BuildOptions,
  builderOpts?: NixpacksBuilderOpts,
): Promise<BuildResult> {
  const bin = builderOpts?.nixpacksBin ?? "nixpacks";
  const timeoutMs = builderOpts?.timeoutMs ?? 600_000;
  const startTime = Date.now();

  // Validate custom commands before passing to Nixpacks
  if (options.buildCmd) {
    validateBuildCommand(options.buildCmd);
  }
  if (options.startCmd) {
    validateBuildCommand(options.startCmd);
  }

  // Build args array — NEVER interpolated into a shell string
  const args: string[] = [
    "build",
    options.sourceDir,
    "--name",
    options.imageTag,
  ];

  if (options.buildCmd) {
    args.push("--build-cmd", options.buildCmd);
  }
  if (options.startCmd) {
    args.push("--start-cmd", options.startCmd);
  }
  if (options.noCache) {
    args.push("--no-cache");
  }

  // Environment variables as individual --env flags
  if (options.envVars) {
    for (const [key, value] of Object.entries(options.envVars)) {
      args.push("--env", `${key}=${value}`);
    }
  }

  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10 MB log buffer
    });

    const buildLog =
      stdout + (stderr ? `\n--- stderr ---\n${stderr}` : "");

    return {
      imageTag: options.imageTag,
      buildLog,
      durationMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const buildLog = extractBuildLog(err);
    throw new NixpacksBuildError(
      `Nixpacks build failed for ${options.imageTag}: ${err instanceof Error ? err.message : String(err)}`,
      buildLog,
    );
  }
}

function extractBuildLog(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { stdout?: string; stderr?: string };
    return (
      (e.stdout ?? "") +
      (e.stderr ? `\n--- stderr ---\n${e.stderr}` : "")
    );
  }
  return "";
}
