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
  source_type: string;
  git_repo?: string;
  git_branch?: string;
  build_type: string;
  port?: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Domain {
  id: string;
  domain: string;
  verified: boolean;
  created_at: string;
}

interface EnvVar {
  key: string;
  is_build: boolean;
  created_at: string;
}

interface Deployment {
  id: string;
  project_id: string;
  status: string;
  version: string;
  created_at: string;
}

interface Metrics {
  cpu: number[];
  memory: number[];
  network: number[];
  timestamps: string[];
}

export function createApiClient(
  baseUrl: string,
  getToken: () => string | null,
) {
  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiResponse<T>> {
    const token = getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      // Redirect to login on unauthorized
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
      return { ok: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } };
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
      source_type: string;
      git_repo?: string;
      git_branch?: string;
      build_type: string;
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
    setEnvVar(projectId: string, key: string, value: string, is_build = false) {
      return request<EnvVar>("POST", `/api/v1/projects/${projectId}/env`, { key, value, is_build });
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
