// Global output mode — switched by the top-level `--json` option in index.ts
// so commands and the API layer can decide whether to emit prose+chalk or
// raw JSON envelopes. Kept in module scope (singleton) for simplicity.
let jsonMode = false;

export function setJsonMode(on: boolean): void {
  jsonMode = on;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

/**
 * Emit success output. In JSON mode, prints `{ ok: true, data }` and returns.
 * In pretty mode, calls the supplied `pretty` callback (which may print
 * tables, colored text, ora spinners, etc.). The data is what's returned to
 * scripts; the pretty callback is purely for humans.
 */
export function emit<T>(data: T, pretty: (data: T) => void): void {
  if (jsonMode) {
    process.stdout.write(JSON.stringify({ ok: true, data }) + "\n");
    return;
  }
  pretty(data);
}

/**
 * Print an error JSON envelope and exit with the given code. Used by the
 * API layer when --json is set so machine consumers always get structured
 * output. `never`-typed so callers can chain it like `throw` for control flow.
 */
export function failJson(
  error: { code: string; message: string; status?: number; details?: unknown },
  exitCode: number,
): never {
  process.stdout.write(JSON.stringify({ ok: false, error }) + "\n");
  process.exit(exitCode);
}
