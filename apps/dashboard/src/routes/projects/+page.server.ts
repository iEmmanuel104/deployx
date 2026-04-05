import { redirect } from "@sveltejs/kit";
import { createServerApiClient } from "$lib/server/api.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch, cookies, locals }) => {
  if (!locals.user) throw redirect(303, "/login");
  const api = createServerApiClient(fetch, cookies);
  const result = await api.getProjects();
  return { projects: result.ok ? result.data : [] };
};
