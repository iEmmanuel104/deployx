import { requireAuth } from "./config.js";

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

/**
 * Fetch wrapper that attaches the saved Bearer token and unwraps DeployX's
 * standard { ok, data, error } envelope. Exits the process with a clear
 * message on auth failure or non-2xx — appropriate for a CLI tool.
 */
export async function apiFetch<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const { server, accessToken } = requireAuth();

  const res = await fetch(`${server}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    console.error("Authentication expired. Run `deployx login` again.");
    process.exit(2);
  }

  const env = (await res.json()) as ApiEnvelope<T>;
  if (!env.ok || env.data === undefined) {
    const msg = env.error?.message ?? `Request failed with ${res.status}`;
    console.error(`API error: ${msg}`);
    if (env.error?.details) console.error(JSON.stringify(env.error.details, null, 2));
    process.exit(1);
  }

  return env.data;
}

/**
 * Server-Sent Events helper for streaming endpoints (logs).
 * Yields lines to the caller as they arrive; exits on EOF.
 */
export async function* apiStreamSse(
  path: string,
): AsyncGenerator<string, void, void> {
  const { server, accessToken } = requireAuth();

  const res = await fetch(`${server}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "text/event-stream",
    },
  });

  if (res.status === 401) {
    console.error("Authentication expired. Run `deployx login` again.");
    process.exit(2);
  }
  if (!res.ok || !res.body) {
    console.error(`Stream failed with ${res.status}: ${res.statusText}`);
    process.exit(1);
  }

  const decoder = new TextDecoder();
  let buf = "";
  const reader = res.body.getReader();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nlIdx;
    while ((nlIdx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nlIdx);
      buf = buf.slice(nlIdx + 1);
      // SSE frames are `data: <payload>` lines, separated by blank lines.
      // Comments start with ":" — ignore.
      if (line.startsWith("data: ")) yield line.slice(6);
    }
  }
  // flush trailing partial line (no newline)
  if (buf.startsWith("data: ")) yield buf.slice(6);
}
