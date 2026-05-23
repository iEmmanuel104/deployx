import type { Command } from "commander";
import chalk from "chalk";
import { apiFetch } from "../lib/api.js";
import { emit, failJson, isJsonMode } from "../lib/output.js";
import { resolveProjectId } from "../lib/projects.js";

interface EnvRow {
  id: string;
  key: string;
  isBuild: number;
  createdAt: string;
  updatedAt: string;
}

export function registerEnvCommand(program: Command): void {
  const env = program
    .command("env")
    .description("Manage encrypted environment variables");

  env
    .command("list")
    .description("List env var keys for a project (values are write-only and never shown)")
    .argument("<project>", "Project slug or ULID")
    .addHelpText("after", "\nExamples:\n  $ deployx env list my-app")
    .action(async (project: string) => {
      const id = await resolveProjectId(project);
      const rows = await apiFetch<EnvRow[]>(
        "GET",
        `/api/v1/projects/${encodeURIComponent(id)}/env`,
        undefined,
        { notFoundLabel: project },
      );
      emit(rows, (data) => {
        if (data.length === 0) {
          console.log(chalk.dim(`No env vars set for '${project}'.`));
          return;
        }
        const w = Math.max(...data.map((r) => r.key.length), 3);
        console.log(`${chalk.bold("KEY".padEnd(w))}  ${chalk.bold("SCOPE".padEnd(8))}  UPDATED`);
        for (const r of data) {
          console.log(
            `${r.key.padEnd(w)}  ${(r.isBuild ? "build" : "runtime").padEnd(8)}  ${chalk.dim(r.updatedAt)}`,
          );
        }
      });
    });

  env
    .command("set")
    .description("Set an environment variable (KEY=VALUE)")
    .argument("<project>", "Project slug or ULID")
    .argument("<assignment>", "KEY=VALUE — KEY must match /^[A-Z_][A-Z0-9_]*$/")
    .option("--build", "Mark as a build-time variable (default: runtime)", false)
    .addHelpText(
      "after",
      "\nExamples:\n" +
        "  $ deployx env set my-app DATABASE_URL=postgres://...\n" +
        "  $ deployx env set my-app NODE_ENV=production\n" +
        "  $ deployx env set my-app GH_TOKEN=ghp_xxx --build",
    )
    .action(async (project: string, assignment: string, options: { build?: boolean }) => {
      const eq = assignment.indexOf("=");
      if (eq <= 0) {
        const msg = "Invalid input: argument must be KEY=VALUE";
        if (isJsonMode()) failJson({ code: "INVALID_INPUT", message: msg }, 1);
        console.error(msg);
        process.exit(1);
      }
      const key = assignment.slice(0, eq);
      const value = assignment.slice(eq + 1);

      const id = await resolveProjectId(project);
      const res = await apiFetch<{ id: string; key: string; isBuild: boolean }>(
        "POST",
        `/api/v1/projects/${encodeURIComponent(id)}/env`,
        { key, value, is_build: options.build ?? false },
        { notFoundLabel: project },
      );
      emit(res, () => console.log(chalk.green(`Set ${key} for '${project}'`)));
    });

  env
    .command("get")
    .description("Show metadata for a single env var (values are write-only and never shown)")
    .argument("<project>", "Project slug or ULID")
    .argument("<key>", "Env var key")
    .addHelpText("after", "\nExamples:\n  $ deployx env get my-app DATABASE_URL")
    .action(async (project: string, key: string) => {
      const id = await resolveProjectId(project);
      const rows = await apiFetch<EnvRow[]>(
        "GET",
        `/api/v1/projects/${encodeURIComponent(id)}/env`,
        undefined,
        { notFoundLabel: project },
      );
      const row = rows.find((r) => r.key === key);
      if (!row) {
        const msg = `Env var '${key}' not set for '${project}'.`;
        if (isJsonMode()) failJson({ code: "NOT_FOUND", message: msg }, 1);
        console.error(msg);
        process.exit(1);
      }
      emit(row, (r) => {
        console.log(`${chalk.bold(r.key)}  (${r.isBuild ? "build" : "runtime"})`);
        console.log(chalk.dim(`  set:     ${r.createdAt}`));
        console.log(chalk.dim(`  updated: ${r.updatedAt}`));
        console.log(chalk.dim(`  value:   <encrypted, write-only>`));
      });
    });

  env
    .command("unset")
    .description("Delete an environment variable")
    .argument("<project>", "Project slug or ULID")
    .argument("<key>", "Env var key to remove")
    .addHelpText("after", "\nExamples:\n  $ deployx env unset my-app OLD_TOKEN")
    .action(async (project: string, key: string) => {
      const id = await resolveProjectId(project);
      const res = await apiFetch<{ key: string; deleted: boolean }>(
        "DELETE",
        `/api/v1/projects/${encodeURIComponent(id)}/env/${encodeURIComponent(key)}`,
        undefined,
        { notFoundLabel: project },
      );
      emit(res, () => console.log(chalk.green(`Unset ${key} for '${project}'`)));
    });
}
