import type { Cookies } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";
import type {
  Project as TypesProject,
  Deployment as TypesDeployment,
  Domain as TypesDomain,
  EnvVar as TypesEnvVar,
  Metric as TypesMetric,
} from "@deployx/types";

const API_URL = process.env.API_URL || "http://localhost:3001";

// The API serialises records with camelCased timestamps and lighter shapes
// than the canonical Zod schemas. We pin our dashboard view types to the
// upstream schema where possible so any rename surfaces as a typecheck error.
export type DashboardProject = Pick<
  TypesProject,
  "id" | "name" | "slug" | "status"
> & {
  sourceType: string;
  gitRepo?: string;
  gitBranch?: string;
  buildType: string;
  port?: number;
  createdAt: string;
  updatedAt: string;
};

export type DashboardDeployment = Pick<
  TypesDeployment,
  "id" | "version" | "trigger" | "status"
> & {
  projectId: string;
  commitSha: string | null;
  commitMsg: string | null;
  imageTag: string | null;
  buildLog: string | null;
  errorMsg: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

export type DashboardDomain = Pick<TypesDomain, "id" | "domain"> & {
  projectId: string;
  verified: boolean;
  sslStatus: string;
  createdAt: string;
};

export type DashboardEnvVar = {
  key: TypesEnvVar["key"];
  isBuild: boolean;
  createdAt: string;
};

export type DashboardMetrics = {
  cpu: TypesMetric["cpu_pct"][];
  memory: TypesMetric["mem_mb"][];
  network: number[];
  timestamps: string[];
};

type ServerApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export function createServerApiClient(
  fetch: typeof globalThis.fetch,
  cookies: Cookies,
) {
  const token = cookies.get("deployx_token");

  async function request<T>(
    path: string,
    options?: RequestInit,
  ): Promise<ServerApiResult<T>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { ...headers, ...(options?.headers as Record<string, string> ?? {}) },
      credentials: "include",
    });

    if (res.status === 401) {
      const refreshRes = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        if (refreshData.ok) {
          cookies.set("deployx_token", refreshData.data.accessToken, {
            path: "/", httpOnly: true, sameSite: "lax", secure: process.env["NODE_ENV"] === "production", maxAge: 60 * 15,
          });
          const retryRes = await fetch(`${API_URL}${path}`, {
            ...options,
            headers: { ...headers, Authorization: `Bearer ${refreshData.data.accessToken}` },
            credentials: "include",
          });
          return retryRes.json() as Promise<ServerApiResult<T>>;
        }
      }

      cookies.delete("deployx_token", { path: "/" });
      throw redirect(303, "/login");
    }

    return res.json() as Promise<ServerApiResult<T>>;
  }

  return {
    getProjects: () => request<DashboardProject[]>("/api/v1/projects"),
    getProject: (id: string) => request<DashboardProject>(`/api/v1/projects/${id}`),
    createProject: (body: Record<string, unknown>) =>
      request<DashboardProject>("/api/v1/projects", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    getDeployments: (projectId: string) =>
      request<DashboardDeployment[]>(`/api/v1/projects/${projectId}/deployments`),
    getDomains: (projectId: string) =>
      request<DashboardDomain[]>(`/api/v1/projects/${projectId}/domains`),
    getEnvVars: (projectId: string) =>
      request<DashboardEnvVar[]>(`/api/v1/projects/${projectId}/env`),
    getMetrics: (projectId: string) =>
      request<DashboardMetrics>(`/api/v1/projects/${projectId}/metrics`),
  };
}
