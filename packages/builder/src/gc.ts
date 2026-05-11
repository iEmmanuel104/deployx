import { readdir, stat, rm } from "node:fs/promises";
import { join } from "node:path";

const BUILDS_DIR = process.env["DEPLOYX_BUILDS_DIR"] ?? "/builds";

export interface GcOptions {
  /** Build artifacts to keep per project slug (default: 5). */
  keepPerProject?: number;
  /** Directory holding build artifacts. Default: $DEPLOYX_BUILDS_DIR or /builds. */
  buildsDir?: string;
  /** If true, do not delete anything — only report what would be deleted. */
  dryRun?: boolean;
}

export interface GcResult {
  buildsDir: string;
  scanned: number;
  kept: number;
  removed: number;
  bytesFreed: number;
  removedPaths: string[];
  errors: Array<{ path: string; message: string }>;
}

/**
 * Garbage-collects old build artifact directories.
 *
 * Build directories follow the pattern `<slug>-XXXXXX` where XXXXXX is the
 * tempdir random suffix from `mkdtemp`. We group by slug, sort by mtime
 * descending, keep the N newest, remove the rest.
 *
 * Safe to run while the queue is active: in-flight build dirs are still
 * newer than the kept threshold (they were created seconds ago) so they
 * won't be touched.
 */
export async function gcBuilds(opts: GcOptions = {}): Promise<GcResult> {
  const buildsDir = opts.buildsDir ?? BUILDS_DIR;
  const keep = Math.max(0, opts.keepPerProject ?? 5);
  const dryRun = opts.dryRun ?? false;

  const result: GcResult = {
    buildsDir,
    scanned: 0,
    kept: 0,
    removed: 0,
    bytesFreed: 0,
    removedPaths: [],
    errors: [],
  };

  let entries: string[];
  try {
    entries = await readdir(buildsDir);
  } catch (err) {
    // Builds dir doesn't exist yet — nothing to collect
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return result;
    }
    throw err;
  }

  // Group entries by slug. mkdtemp suffix is 6 chars; the slug-prefix ends at
  // the last "-" before that suffix. We split on the LAST "-" and group on
  // everything before it.
  const byProject = new Map<
    string,
    Array<{ path: string; mtimeMs: number; size: number }>
  >();

  for (const name of entries) {
    const path = join(buildsDir, name);
    let s;
    try {
      s = await stat(path);
    } catch (err) {
      result.errors.push({
        path,
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    if (!s.isDirectory()) continue;

    result.scanned += 1;

    // Extract the slug (everything before the random suffix).
    const lastDash = name.lastIndexOf("-");
    const slug = lastDash > 0 ? name.slice(0, lastDash) : name;

    const arr = byProject.get(slug) ?? [];
    arr.push({ path, mtimeMs: s.mtimeMs, size: await dirSize(path) });
    byProject.set(slug, arr);
  }

  for (const [, dirs] of byProject) {
    // Newest first
    dirs.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const keepers = dirs.slice(0, keep);
    const removers = dirs.slice(keep);

    result.kept += keepers.length;

    for (const d of removers) {
      if (dryRun) {
        result.removed += 1;
        result.bytesFreed += d.size;
        result.removedPaths.push(d.path);
        continue;
      }
      try {
        await rm(d.path, { recursive: true, force: true });
        result.removed += 1;
        result.bytesFreed += d.size;
        result.removedPaths.push(d.path);
      } catch (err) {
        result.errors.push({
          path: d.path,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return result;
}

/**
 * Best-effort recursive size sum. Errors during traversal are swallowed so
 * GC doesn't fail on a single unreadable file — we just under-report bytes.
 */
async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      total += await dirSize(p);
    } else if (e.isFile()) {
      try {
        const s = await stat(p);
        total += s.size;
      } catch {
        // ignore
      }
    }
  }
  return total;
}
