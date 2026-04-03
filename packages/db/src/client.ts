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
