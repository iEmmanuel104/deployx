import { fail, redirect } from "@sveltejs/kit";
import { createServerApiClient } from "$lib/server/api.js";
import type { Actions, PageServerLoad } from "./$types";

// Use RegExp constructor instead of a regex literal to avoid the `/v` flag,
// which some Svelte/TS toolchains reject. Matches a 1-48 char slug starting
// and ending with an alphanumeric, with hyphens allowed in between.
const SLUG_REGEX = new RegExp("^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$");

function field(form: FormData, key: string, fallback = ""): string {
  const v = form.get(key);
  return typeof v === "string" ? v : fallback;
}

export const load: PageServerLoad = ({ locals }) => {
  if (!locals.user) throw redirect(303, "/login");
  return {};
};

export const actions: Actions = {
  default: async ({ request, fetch, cookies, locals }) => {
    if (!locals.user) throw redirect(303, "/login");

    const form = await request.formData();
    const name = field(form, "name").trim();
    const slug = field(form, "slug").trim();
    const sourceType = field(form, "sourceType", "git");
    const gitRepo = field(form, "gitRepo").trim();
    const gitBranch = field(form, "gitBranch", "main").trim() || "main";
    const buildType = field(form, "buildType", "nixpacks");
    const portRaw = field(form, "port", "3000");
    const port = Number.parseInt(portRaw, 10);

    const values = {
      name,
      slug,
      sourceType,
      gitRepo,
      gitBranch,
      buildType,
      port: portRaw,
    };

    if (!name) {
      return fail(400, { error: "Project name is required", values });
    }
    if (!SLUG_REGEX.test(slug)) {
      return fail(400, {
        error:
          "Slug must be 1-48 lowercase letters, numbers, or hyphens, and start/end with an alphanumeric character.",
        values,
      });
    }
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      return fail(400, {
        error: "Port must be between 1 and 65535",
        values,
      });
    }
    if (sourceType === "git" && !gitRepo) {
      return fail(400, {
        error: "Git repository URL is required for Git source",
        values,
      });
    }

    const body: Record<string, unknown> = {
      name,
      slug,
      source_type: sourceType,
      build_type: buildType,
      port,
    };
    if (sourceType === "git") {
      body.git_repo = gitRepo;
      body.git_branch = gitBranch;
    }

    const api = createServerApiClient(fetch, cookies);
    const res = await api.createProject(body);

    if (!res.ok) {
      return fail(400, {
        error: res.error.message || "Failed to create project",
        values,
      });
    }

    throw redirect(303, `/projects/${slug}`);
  },
};
