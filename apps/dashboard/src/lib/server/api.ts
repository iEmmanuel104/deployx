import type { Cookies } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";

const API_URL = process.env.API_URL || "http://localhost:3001";

export function createServerApiClient(
  fetch: typeof globalThis.fetch,
  cookies: Cookies,
) {
  const token = cookies.get("deployx_token");

  async function request<T>(path: string, options?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: { code: string; message: string } }> {
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
      // Try refresh
      const refreshRes = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        if (refreshData.ok) {
          cookies.set("deployx_token", refreshData.data.accessToken, {
            path: "/", httpOnly: true, sameSite: "lax", secure: false, maxAge: 60 * 15,
          });
          // Retry with new token
          const retryRes = await fetch(`${API_URL}${path}`, {
            ...options,
            headers: { ...headers, Authorization: `Bearer ${refreshData.data.accessToken}` },
            credentials: "include",
          });
          return retryRes.json();
        }
      }

      cookies.delete("deployx_token", { path: "/" });
      throw redirect(303, "/login");
    }

    return res.json();
  }

  return {
    getProjects: () => request<unknown[]>("/api/v1/projects"),
    getProject: (id: string) => request<unknown>(`/api/v1/projects/${id}`),
    getDeployments: (projectId: string) => request<unknown[]>(`/api/v1/projects/${projectId}/deployments`),
    getDomains: (projectId: string) => request<unknown[]>(`/api/v1/projects/${projectId}/domains`),
    getEnvVars: (projectId: string) => request<unknown[]>(`/api/v1/projects/${projectId}/env`),
    getMetrics: (projectId: string) => request<unknown[]>(`/api/v1/projects/${projectId}/metrics`),
  };
}
