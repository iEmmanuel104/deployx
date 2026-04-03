import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import {
  DeployxConfigSchema,
  PlatformConfigSchema,
} from "@deployx/types";
import type { DeployxConfig, PlatformConfig } from "@deployx/types";

/**
 * Reads and validates a deployx.yaml configuration file.
 *
 * @param filePath - Absolute or relative path to the deployx.yaml file
 * @returns Validated DeployxConfig object
 * @throws {Error} If the file cannot be read or validation fails
 */
export function loadDeployxConfig(filePath: string): DeployxConfig {
  const raw = readFileSync(filePath, "utf-8");
  const parsed: unknown = parseYaml(raw);

  const result = DeployxConfigSchema.safeParse(parsed);
  if (!result.success) {
    const messages = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid deployx.yaml configuration:\n${messages}`,
    );
  }

  return result.data;
}

/**
 * Loads platform configuration from environment variables and validates it.
 *
 * Required env vars:
 *   - PLATFORM_DOMAIN
 *   - ENCRYPTION_KEY (64 hex chars = 32 bytes)
 *   - JWT_SECRET
 *
 * Optional env vars (with defaults):
 *   - DB_PATH (default: /data/platform.db)
 *   - PORT (default: 3001)
 *   - NODE_ENV (default: production)
 *   - ACME_EMAIL
 *   - BACKUP_BUCKET
 *
 * @returns Validated PlatformConfig object
 * @throws {Error} If required env vars are missing or validation fails
 */
export function loadPlatformConfig(): PlatformConfig {
  const env = {
    PLATFORM_DOMAIN: process.env["PLATFORM_DOMAIN"],
    ENCRYPTION_KEY: process.env["ENCRYPTION_KEY"],
    JWT_SECRET: process.env["JWT_SECRET"],
    DB_PATH: process.env["DB_PATH"],
    PORT: process.env["PORT"],
    NODE_ENV: process.env["NODE_ENV"],
    ACME_EMAIL: process.env["ACME_EMAIL"],
    BACKUP_BUCKET: process.env["BACKUP_BUCKET"],
  };

  // Strip undefined values so Zod defaults kick in
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== ""),
  );

  const result = PlatformConfigSchema.safeParse(cleaned);
  if (!result.success) {
    const messages = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid platform configuration:\n${messages}`,
    );
  }

  return result.data;
}

export type { DeployxConfig, PlatformConfig };
