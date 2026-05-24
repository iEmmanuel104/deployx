import { config as dotenvConfig } from "dotenv";

let loaded = false;

const REQUIRED = ["ENCRYPTION_KEY", "JWT_SECRET"] as const;

// Known placeholder values that must never reach production. Running with a
// default secret would let anyone mint valid JWTs or decrypt env vars.
const FORBIDDEN: Record<string, string> = {
  JWT_SECRET: "change-me-in-production",
  ENCRYPTION_KEY: "change-me-in-production",
};

/**
 * Loads .env into process.env (idempotent) and fail-fast validates the
 * required secrets are present and not set to a documented placeholder.
 *
 * Production deployments (systemd, Docker) set env vars before launching
 * Node — dotenv is a no-op in that case because by default it doesn't
 * override existing values. In local dev / CI we still pick up a .env at
 * the project root.
 *
 * On validation failure this writes a single-line FATAL message to stderr
 * and calls process.exit(1). NODE_ENV=test skips the secret checks so the
 * in-memory test harness can set its own.
 *
 * Use this in place of `import "dotenv/config"` so there is a single hook
 * for env loading + validation across the API entrypoint and any future
 * worker processes.
 */
export function loadEnv(options: { path?: string; override?: boolean } = {}): void {
  if (loaded) return;
  dotenvConfig({
    path: options.path,
    override: options.override ?? false,
  });
  loaded = true;

  if (process.env["NODE_ENV"] === "test") return;

  for (const k of REQUIRED) {
    if (!process.env[k]) {
      console.error(`FATAL: ${k} is required`);
      process.exit(1);
    }
  }
  for (const [k, bad] of Object.entries(FORBIDDEN)) {
    if (process.env[k] === bad) {
      console.error(`FATAL: ${k} is default — change in production`);
      process.exit(1);
    }
  }
}
