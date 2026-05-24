interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface Project {
  id: string;
  name: string;
  slug: string;
  sourceType: string;
  gitRepo?: string;
  gitBranch?: string;
  buildType: string;
  port?: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface Domain {
  id: string;
  domain: string;
  verified: boolean;
  sslStatus: string;
  projectId: string;
  createdAt: string;
}

interface EnvVar {
  key: string;
  isBuild: boolean;
  createdAt: string;
}

interface Deployment {
  id: string;
  projectId: string;
  status: string;
  version: number;
  trigger: string;
  commitSha: string | null;
  commitMsg: string | null;
  imageTag: string | null;
  buildLog: string | null;
  errorMsg: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

interface Metrics {
  cpu: number[];
  memory: number[];
  network: number[];
  timestamps: string[];
}

export type { ApiResponse, AuthTokens, Project, Domain, EnvVar, Deployment, Metrics };

export function createApiClient(
  baseUrl: string,
  getToken: () => string | null,
  setToken?: (token: string) => void,
) {
  // Single in-flight refresh promise so a burst of parallel 401s only triggers
  // one /auth/refresh call. All callers await the same promise and then retry.
  let refreshInFlight: Promise<string | null> | null = null;

  async function refreshToken(): Promise<string | null> {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      try {
        const r = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (!r.ok) return null;
        const payload = (await r.json()) as ApiResponse<{ accessToken: string }>;
        if (!payload.ok || !payload.data?.accessToken) return null;
        const next = payload.data.accessToken;
        if (setToken) setToken(next);
        // Mirror the new token to the SvelteKit session cookie so a hard
        // reload picks it up via layout.server.ts.
        if (typeof window !== "undefined") {
          await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken: next }),
          });
        }
        return next;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  }

  async function doFetch(
    method: string,
    path: string,
    serializedBody: string | undefined,
    token: string | null,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: serializedBody,
      credentials: "include",
    });
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiResponse<T>> {
    // Fastify with @fastify/json content-type parser rejects an empty body
    // when Content-Type: application/json is set. Always send a JSON-encoded
    // body so POSTs without an explicit payload still parse cleanly.
    const serializedBody =
      method === "GET" || method === "HEAD"
        ? undefined
        : JSON.stringify(body ?? {});

    let res = await doFetch(method, path, serializedBody, getToken());

    // On 401, try one silent refresh-then-retry round. Don't refresh on the
    // refresh endpoint itself — that would loop. 403 means the token is
    // valid but the user lacks permission; refreshing won't help.
    if (res.status === 401 && !path.startsWith("/api/v1/auth/")) {
      const next = await refreshToken();
      if (next) {
        res = await doFetch(method, path, serializedBody, next);
      }
    }

    if (res.status === 401 || res.status === 403) {
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
      const code = res.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN";
      const message = res.status === 401 ? "Unauthorized" : "Forbidden";
      return { ok: false, error: { code, message } };
    }

    return (await res.json()) as ApiResponse<T>;
  }

  return {
    // Auth
    login(email: string, password: string) {
      return request<AuthTokens>("POST", "/api/v1/auth/login", { email, password });
    },
    register(email: string, password: string, name: string) {
      return request<AuthTokens>("POST", "/api/v1/auth/register", { email, password, name });
    },

    // Projects
    getProjects() {
      return request<Project[]>("GET", "/api/v1/projects");
    },
    getProject(id: string) {
      return request<Project>("GET", `/api/v1/projects/${id}`);
    },
    createProject(data: {
      name: string;
      slug: string;
      sourceType: string;
      gitRepo?: string;
      gitBranch?: string;
      buildType: string;
      port?: number;
    }) {
      return request<Project>("POST", "/api/v1/projects", data);
    },
    deleteProject(id: string) {
      return request<void>("DELETE", `/api/v1/projects/${id}`);
    },

    // Deploy actions
    deploy(projectId: string) {
      return request<Deployment>("POST", `/api/v1/projects/${projectId}/deploy`);
    },
    stop(projectId: string) {
      return request<void>("POST", `/api/v1/projects/${projectId}/stop`);
    },
    restart(projectId: string) {
      return request<void>("POST", `/api/v1/projects/${projectId}/restart`);
    },
    rollback(projectId: string, version: number) {
      return request<Deployment>(
        "POST",
        `/api/v1/projects/${projectId}/rollback/${version}`,
      );
    },

    // Domains
    getDomains(projectId: string) {
      return request<Domain[]>("GET", `/api/v1/projects/${projectId}/domains`);
    },
    addDomain(projectId: string, domain: string) {
      return request<Domain>("POST", `/api/v1/projects/${projectId}/domains`, { domain });
    },
    removeDomain(projectId: string, domainId: string) {
      return request<void>("DELETE", `/api/v1/projects/${projectId}/domains/${domainId}`);
    },

    // Env vars
    getEnvVars(projectId: string) {
      return request<EnvVar[]>("GET", `/api/v1/projects/${projectId}/env`);
    },
    setEnvVar(projectId: string, key: string, value: string, isBuild = false) {
      return request<EnvVar>("POST", `/api/v1/projects/${projectId}/env`, { key, value, isBuild });
    },
    deleteEnvVar(projectId: string, key: string) {
      return request<void>("DELETE", `/api/v1/projects/${projectId}/env/${key}`);
    },

    // Metrics
    getMetrics(projectId: string, params?: { from?: string; to?: string; interval?: string }) {
      const query = new URLSearchParams();
      if (params?.from) query.set("from", params.from);
      if (params?.to) query.set("to", params.to);
      if (params?.interval) query.set("interval", params.interval);
      const qs = query.toString();
      return request<Metrics>("GET", `/api/v1/projects/${projectId}/metrics${qs ? `?${qs}` : ""}`);
    },

    // Deployments
    getDeployments(projectId: string) {
      return request<Deployment[]>("GET", `/api/v1/projects/${projectId}/deployments`);
    },
  };
}
