import Conf from "conf";

interface CliConfig {
  server: string;
  accessToken: string;
  refreshToken: string;
  userEmail: string;
}

/**
 * Single source of truth for CLI auth + server URL. Persists to
 * ~/.config/deployx/config.json (or platform equivalent) via the `conf`
 * package. Token rotation is the caller's responsibility for now —
 * refresh-token rotation lives on the API side.
 */
export const config = new Conf<Partial<CliConfig>>({
  projectName: "deployx",
  schema: {
    server: { type: "string" },
    accessToken: { type: "string" },
    refreshToken: { type: "string" },
    userEmail: { type: "string" },
  },
});

export function requireAuth(): { server: string; accessToken: string } {
  const server = config.get("server") as string | undefined;
  const accessToken = config.get("accessToken") as string | undefined;
  if (!server || !accessToken) {
    console.error(
      "Not logged in. Run `deployx login --server <url>` first.",
    );
    process.exit(2);
  }
  return { server: server.replace(/\/$/, ""), accessToken };
}

export function clearAuth(): void {
  config.delete("accessToken");
  config.delete("refreshToken");
  config.delete("userEmail");
}
