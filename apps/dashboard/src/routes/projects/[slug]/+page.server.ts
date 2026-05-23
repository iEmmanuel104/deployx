import { redirect, error } from "@sveltejs/kit";
import { createServerApiClient } from "$lib/server/api.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, fetch, cookies, locals }) => {
  if (!locals.user) throw redirect(303, "/login");

  const api = createServerApiClient(fetch, cookies);

  const projectsResult = await api.getProjects();
  if (!projectsResult.ok) throw error(500, "Failed to load projects");

  const project = projectsResult.data.find((p) => p.slug === params.slug);
  if (!project) throw error(404, "Project not found");

  const [deploymentsResult, domainsResult, envVarsResult] = await Promise.all([
    api.getDeployments(project.id),
    api.getDomains(project.id),
    api.getEnvVars(project.id),
  ]);

  return {
    project,
    deployments: deploymentsResult.ok ? deploymentsResult.data : [],
    domains: domainsResult.ok ? domainsResult.data : [],
    envVars: envVarsResult.ok ? envVarsResult.data : [],
  };
};
