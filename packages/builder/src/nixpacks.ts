import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rename, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ulid } from "ulidx";
import type { BuildOptions } from "@deployx/types";
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
 * Result of running `nixpacks build --out`.
 *
 * Nixpacks writes its build artefacts (Dockerfile, build.sh, nixpkgs-*.nix)
 * into a `.nixpacks/` subdirectory. The Dockerfile contains `COPY . /app`
 * so it must be built with the **source directory** as the docker build
 * context — not the out directory. To make that work in a single
 * `docker build` call we merge the `.nixpacks/` directory back into the
 * source tree.
 */
export interface NixpacksGenerateResult {
  /** Source directory ready to be tarred as the docker build context. Contains a `.nixpacks/` directory. */
  contextDir: string;
  /** Dockerfile path relative to contextDir (always ".nixpacks/Dockerfile"). */
  dockerfile: string;
  /** Combined stdout/stderr from Nixpacks. */
  buildLog: string;
  /** Wall-clock time in ms. */
  durationMs: number;
}

/**
 * Runs Nixpacks in "generate Dockerfile" mode (`nixpacks build --out`).
 *
 * This replaces the previous `--name` invocation which shells out to
 * `docker buildx build` with the docker-container driver — that driver
 * needs a WebSocket upgrade on `/session` which the Tecnativa
 * docker-socket-proxy intentionally refuses.
 *
 * Uses execFile (NOT exec) to prevent command injection — arguments are
 * passed as an array, never interpolated into a shell string.
 *
 * The returned `contextDir` IS `options.sourceDir` with a `.nixpacks/`
 * subdirectory merged in. The caller is responsible for cleaning up the
 * source dir (which already happens via `cleanupBuildDir`).
 */
export async function buildWithNixpacks(
  options: BuildOptions,
  builderOpts?: NixpacksBuilderOpts,
): Promise<NixpacksGenerateResult> {
  const bin = builderOpts?.nixpacksBin ?? "nixpacks";
  const timeoutMs = builderOpts?.timeoutMs ?? 600_000;
  const startTime = Date.now();

  if (options.buildCmd) {
    validateBuildCommand(options.buildCmd);
  }
  if (options.startCmd) {
    validateBuildCommand(options.startCmd);
  }

  const outDir = await mkdtemp(join(tmpdir(), `deployx-nixpacks-${ulid()}-`));

  // Build args array — NEVER interpolated into a shell string
  const args: string[] = [
    "build",
    options.sourceDir,
    "--out",
    outDir,
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

  if (options.envVars) {
    for (const [key, value] of Object.entries(options.envVars)) {
      args.push("--env", `${key}=${value}`);
    }
  }

  let stdout = "";
  let stderr = "";
  try {
    const res = await execFileAsync(bin, args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10 MB log buffer
    });
    stdout = res.stdout;
    stderr = res.stderr;
  } catch (err: unknown) {
    await rm(outDir, { recursive: true, force: true }).catch(() => {});
    const buildLog = extractBuildLog(err);
    throw new NixpacksBuildError(
      `Nixpacks build failed for ${options.imageTag}: ${err instanceof Error ? err.message : String(err)}`,
      buildLog,
    );
  }

  // Move the .nixpacks/ folder from outDir into the source directory so the
  // docker build context includes both the app source and the generated
  // Dockerfile. Nixpacks' Dockerfile uses `COPY . /app` so the context root
  // must be the source dir, not outDir.
  const nixpacksSubdir = join(outDir, ".nixpacks");
  try {
    await access(nixpacksSubdir);
  } catch {
    await rm(outDir, { recursive: true, force: true }).catch(() => {});
    throw new NixpacksBuildError(
      `Nixpacks did not produce a .nixpacks/ directory at ${nixpacksSubdir}`,
      stdout + (stderr ? `\n--- stderr ---\n${stderr}` : ""),
    );
  }

  const targetNixpacks = join(options.sourceDir, ".nixpacks");
  await rm(targetNixpacks, { recursive: true, force: true }).catch(() => {});
  await rename(nixpacksSubdir, targetNixpacks);
  await rm(outDir, { recursive: true, force: true }).catch(() => {});

  const buildLog = stdout + (stderr ? `\n--- stderr ---\n${stderr}` : "");

  return {
    contextDir: options.sourceDir,
    dockerfile: ".nixpacks/Dockerfile",
    buildLog,
    durationMs: Date.now() - startTime,
  };
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
