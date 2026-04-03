import Conf from "conf";

interface CliConfig {
  apiUrl: string;
  authToken?: string;
}

const config = new Conf<CliConfig>({
  projectName: "deployx",
  defaults: {
    apiUrl: "http://localhost:3001",
  },
});

export function getApiUrl(): string {
  return config.get("apiUrl");
}

export function setApiUrl(url: string): void {
  config.set("apiUrl", url);
}

export function getAuthToken(): string | undefined {
  return config.get("authToken");
}

export function setAuthToken(token: string): void {
  config.set("authToken", token);
}

export function clearAuthToken(): void {
  config.delete("authToken");
}
