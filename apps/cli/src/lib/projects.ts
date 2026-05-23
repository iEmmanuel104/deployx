import { apiFetch } from "./api.js";
import { failJson, isJsonMode } from "./output.js";

export interface ProjectRow {
  id: string;
  userId: string;
  name: string;
  slug: string;
  sourceType: string;
  gitRepo: string | null;
  gitBranch: string | null;
  buildType: string;
  port: number | null;
  status: string;
  containerId?: string | null;
  createdAt: string;
  updatedAt: string;
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function looksLikeUlid(id: string): boolean {
  return ULID_RE.test(id);
}

/**
 * Accepts either a ULID or a slug and returns the project id. We resolve
 * slugs by listing the user's projects — this is fine for typical fleet sizes
 * and avoids forcing the API to add a /by-slug route just for the CLI.
 */
export async function resolveProjectId(idOrSlug: string): Promise<string> {
  if (looksLikeUlid(idOrSlug)) return idOrSlug;

  const list = await apiFetch<ProjectRow[]>("GET", "/api/v1/projects");
  const match = list.find((p) => p.slug === idOrSlug);
  if (!match) {
    const msg = `Project '${idOrSlug}' not found. Run \`deployx projects\` to list.`;
    if (isJsonMode()) failJson({ code: "NOT_FOUND", message: msg }, 1);
    console.error(msg);
    process.exit(1);
  }
  return match.id;
}
