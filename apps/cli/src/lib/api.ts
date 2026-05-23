import { requireAuth } from "./config.js";
import { failJson, isJsonMode } from "./output.js";

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

export interface ApiFetchOptions {
  /**
   * Caller-facing label for the resource (e.g. project slug). Used to render
   * a more helpful 404 message — `Project 'foo' not found...`. Optional.
   */
  notFoundLabel?: string;
  /**
   * If provided, the value is sent as the `Idempotency-Key` header so the
   * server can dedupe retried POSTs.
   */
  idempotencyKey?: string;
}

/**
 * Fetch wrapper that attaches the saved Bearer token and unwraps DeployX's
 * standard { ok, data, error } envelope. Translates HTTP failures into
 * actionable user-facing messages, then exits with a stable code:
 *   1 = API/business error    2 = auth missing/expired    3 = network failure
 */
export async function apiFetch<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: ApiFetchOptions = {},
): Promise<T> {
  const { server, accessToken } = requireAuth();

  let res: Response;
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    };
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

    res = await fetch(`${server}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    failNetwork(server, err);
  }

  if (res.status === 401) {
    if (isJsonMode()) {
      failJson(
        { code: "AUTH_EXPIRED", message: "Authentication expired. Run `deployx login` again." },
        2,
      );
    }
    console.error("Authentication expired. Run `deployx login` again.");
    process.exit(2);
  }

  if (res.status === 403) {
    const msg = "Permission denied / token scope insufficient";
    if (isJsonMode()) failJson({ code: "FORBIDDEN", message: msg }, 1);
    console.error(msg);
    process.exit(1);
  }

  let env: ApiEnvelope<T>;
  try {
    env = (await res.json()) as ApiEnvelope<T>;
  } catch {
    const msg = `Server error (${res.status}). Check \`deployx logs <project>\` or contact admin.`;
    if (isJsonMode()) failJson({ code: "SERVER_ERROR", message: msg, status: res.status }, 1);
    console.error(msg);
    process.exit(1);
  }

  if (env.ok && env.data !== undefined) return env.data;

  const apiMsg = env.error?.message ?? `Request failed with ${res.status}`;
  let userMsg = apiMsg;
  let code = env.error?.code ?? `HTTP_${res.status}`;

  if (res.status === 404) {
    userMsg = opts.notFoundLabel
      ? `Project '${opts.notFoundLabel}' not found. Run \`deployx projects\` to list.`
      : `Not found: ${apiMsg}`;
    code = "NOT_FOUND";
  } else if (res.status === 409) {
    userMsg = `Operation conflicts with current state: ${apiMsg}`;
    code = env.error?.code ?? "CONFLICT";
  } else if (res.status === 422 || res.status === 400) {
    userMsg = `Invalid input: ${apiMsg}`;
    code = env.error?.code ?? "INVALID_INPUT";
  } else if (res.status >= 500) {
    userMsg = `Server error. Check \`deployx logs <project>\` or contact admin. (${apiMsg})`;
    code = env.error?.code ?? "SERVER_ERROR";
  }

  if (isJsonMode()) {
    failJson({ code, message: userMsg, status: res.status, details: env.error?.details }, 1);
  }

  console.error(`Error: ${userMsg}`);
  if (env.error?.details) console.error(JSON.stringify(env.error.details, null, 2));
  process.exit(1);
}

function failNetwork(server: string, err: unknown): never {
  const detail = err instanceof Error ? err.message : String(err);
  const msg = `Cannot reach ${server} (${detail})`;
  if (isJsonMode()) failJson({ code: "NETWORK", message: msg }, 3);
  console.error(msg);
  process.exit(3);
}

/**
 * Server-Sent Events helper for streaming endpoints (logs).
 * Yields lines to the caller as they arrive; exits on EOF.
 */
export async function* apiStreamSse(
  path: string,
): AsyncGenerator<string, void, void> {
  const { server, accessToken } = requireAuth();

  let res: Response;
  try {
    res = await fetch(`${server}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "text/event-stream",
      },
    });
  } catch (err) {
    failNetwork(server, err);
  }

  if (res.status === 401) {
    if (isJsonMode()) {
      failJson(
        { code: "AUTH_EXPIRED", message: "Authentication expired. Run `deployx login` again." },
        2,
      );
    }
    console.error("Authentication expired. Run `deployx login` again.");
    process.exit(2);
  }
  if (!res.ok || !res.body) {
    const msg = `Stream failed with ${res.status}: ${res.statusText}`;
    if (isJsonMode()) failJson({ code: "STREAM_FAILED", message: msg, status: res.status }, 1);
    console.error(msg);
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
