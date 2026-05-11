import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export function createDb(dbPath: string) {
  const sqlite = new Database(dbPath);

  // Apply WAL mode pragmas (PRD section 19.3) — order matters
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = normal");
  sqlite.pragma("temp_store = memory");
  sqlite.pragma("mmap_size = 30000000000");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("wal_autocheckpoint = 1000");
  sqlite.pragma("journal_size_limit = 67108864");
  sqlite.pragma("cache_size = -32000");

  return drizzle(sqlite, { schema });
}

export type DeployxDb = ReturnType<typeof createDb>;

/**
 * Probe the SQLite database to verify it is readable + structurally sound.
 * Runs PRAGMA quick_check(1) — a cheap consistency check used for /readyz.
 *
 * Returns { ok: true } when healthy, { ok: false, detail: ... } otherwise.
 * Never throws; callers can return its result directly as JSON.
 */
export function probeDb(db: DeployxDb): { ok: true } | { ok: false; detail: unknown } {
  try {
    // Drizzle's better-sqlite3 driver exposes the underlying handle as $client.
    const sqlite = (db as unknown as { $client: Database.Database }).$client;
    const result = sqlite.pragma("quick_check(1)") as Array<{ quick_check?: string }>;
    const ok =
      Array.isArray(result) &&
      result.length === 1 &&
      result[0]?.quick_check === "ok";
    return ok ? { ok: true } : { ok: false, detail: result };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
