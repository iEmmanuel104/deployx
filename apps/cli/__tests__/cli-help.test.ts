import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const execFileP = promisify(execFile);

// Locate the built CLI relative to this test file rather than CWD so it works
// whether invoked via `pnpm -F @deployx/cli test` or `pnpm test` at the root.
const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(HERE, "..", "dist", "index.js");

async function run(
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileP("node", [CLI, ...args], {
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      code?: number | string;
      stdout?: string;
      stderr?: string;
    };
    return {
      code: typeof e.code === "number" ? e.code : 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? String(err),
    };
  }
}

describe("CLI help output (T5)", () => {
  beforeAll(() => {
    if (!existsSync(CLI)) {
      throw new Error(
        `CLI not built — expected ${CLI}. Run \`pnpm -F @deployx/cli build\` first.`,
      );
    }
  });

  it("--help lists every registered command", async () => {
    const { code, stdout } = await run(["--help"]);
    expect(code).toBe(0);
    // every command name must appear under the "Commands:" section
    for (const cmd of [
      "login",
      "projects",
      "deploy",
      "stop",
      "restart",
      "logs",
      "env",
      "domains",
      "rollback",
      "builds",
    ]) {
      expect(stdout).toMatch(new RegExp(`\\b${cmd}\\b`));
    }
    // global --json flag is advertised
    expect(stdout).toContain("--json");
  });

  it("--version returns 0 and prints a semver", async () => {
    const { code, stdout } = await run(["--version"]);
    expect(code).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  // every command-level --help should at minimum surface an Examples block,
  // because that's our C5 promise. Some are subcommand parents (no examples
  // of their own) — skip those with .each().
  const COMMANDS_WITH_EXAMPLES: ReadonlyArray<string> = [
    "login",
    "deploy",
    "stop",
    "restart",
    "logs",
    "rollback",
  ];

  it.each(COMMANDS_WITH_EXAMPLES)(
    "`%s --help` exits 0 and contains an Examples block",
    async (cmd) => {
      const { code, stdout } = await run([cmd, "--help"]);
      expect(code).toBe(0);
      expect(stdout).toContain("Examples:");
    },
  );

  it("unknown command exits non-zero (commander default)", async () => {
    const { code } = await run(["this-is-not-a-command"]);
    expect(code).not.toBe(0);
  });

  it("--json on a command that hits requireAuth emits a JSON error envelope (AUTH_MISSING)", async () => {
    // No config token in this test environment; requireAuth() short-circuits
    // BEFORE any network call. With --json the short-circuit must emit a
    // JSON envelope on stderr (not a prose console.error).
    //
    // We point CONF at a throwaway directory so the host's real saved CLI
    // creds (if any) can't interfere with the no-auth assertion.
    const tmpConf = `/tmp/deployx-cli-test-${Date.now()}`;
    const { code, stderr, stdout } = await execFileP(
      "node",
      [CLI, "--json", "projects", "list"],
      {
        env: {
          ...process.env,
          NO_COLOR: "1",
          XDG_CONFIG_HOME: tmpConf,
        },
      },
    ).catch((err: NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string }) => ({
      code: typeof err.code === "number" ? err.code : 2,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? String(err),
    }));

    expect(code).toBe(2);
    // Either stderr or stdout — find the first line that parses as a JSON
    // envelope (ours emit on stderr but tolerate either to be robust).
    const haystack = `${stderr}\n${stdout}`;
    let parsed: { ok?: boolean; error?: { code?: string } } | null = null;
    for (const line of haystack.split(/\r?\n/)) {
      if (!line.trim().startsWith("{")) continue;
      try {
        parsed = JSON.parse(line);
        break;
      } catch {
        /* not this line */
      }
    }
    expect(parsed).not.toBeNull();
    expect(parsed!.ok).toBe(false);
    expect(parsed!.error?.code).toBe("AUTH_MISSING");
  });
});
