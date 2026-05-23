import type { Command } from "commander";
import chalk from "chalk";
import { apiFetch } from "../lib/api.js";
import { emit, failJson, isJsonMode } from "../lib/output.js";
import { resolveProjectId } from "../lib/projects.js";

interface DomainRow {
  id: string;
  projectId: string;
  domain: string;
  isPrimary: number;
  sslStatus: string;
  sslCertExp: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

export function registerDomainsCommand(program: Command): void {
  const domains = program
    .command("domains")
    .description("Manage custom domains attached to a project");

  domains
    .command("list")
    .description("List all custom domains for a project")
    .argument("<project>", "Project slug or ULID")
    .addHelpText("after", "\nExamples:\n  $ deployx domains list my-app")
    .action(async (project: string) => {
      const id = await resolveProjectId(project);
      const rows = await apiFetch<DomainRow[]>(
        "GET",
        `/api/v1/projects/${encodeURIComponent(id)}/domains`,
        undefined,
        { notFoundLabel: project },
      );
      emit(rows, (data) => {
        if (data.length === 0) {
          console.log(chalk.dim(`No custom domains for '${project}'.`));
          return;
        }
        const w = Math.max(...data.map((r) => r.domain.length), 6);
        console.log(`${chalk.bold("DOMAIN".padEnd(w))}  ${chalk.bold("SSL".padEnd(10))}  ${chalk.bold("PRIMARY")}`);
        for (const r of data) {
          console.log(
            `${r.domain.padEnd(w)}  ${sslColor(r.sslStatus).padEnd(10)}  ${r.isPrimary ? chalk.green("yes") : chalk.dim("no")}`,
          );
        }
      });
    });

  domains
    .command("add")
    .description("Attach a custom domain to a project (SSL provisions on first request)")
    .argument("<project>", "Project slug or ULID")
    .argument("<domain>", "RFC-1123 domain name (e.g. app.example.com)")
    .addHelpText("after", "\nExamples:\n  $ deployx domains add my-app app.example.com")
    .action(async (project: string, domain: string) => {
      const id = await resolveProjectId(project);
      const res = await apiFetch<DomainRow>(
        "POST",
        `/api/v1/projects/${encodeURIComponent(id)}/domains`,
        { domain },
        { notFoundLabel: project },
      );
      emit(res, (d) => {
        console.log(chalk.green(`Added ${d.domain} to '${project}'`));
        console.log(chalk.dim(`  SSL: ${d.sslStatus} (provisions on first HTTPS request)`));
      });
    });

  domains
    .command("remove")
    .description("Remove a custom domain from a project")
    .argument("<project>", "Project slug or ULID")
    .argument("<domain>", "Domain name to remove")
    .addHelpText("after", "\nExamples:\n  $ deployx domains remove my-app app.example.com")
    .action(async (project: string, domain: string) => {
      const id = await resolveProjectId(project);
      // The API removes by domain row id, so we look it up first.
      const rows = await apiFetch<DomainRow[]>(
        "GET",
        `/api/v1/projects/${encodeURIComponent(id)}/domains`,
        undefined,
        { notFoundLabel: project },
      );
      const row = rows.find((r) => r.domain === domain);
      if (!row) {
        const msg = `Domain '${domain}' is not attached to '${project}'.`;
        if (isJsonMode()) failJson({ code: "NOT_FOUND", message: msg }, 1);
        console.error(msg);
        process.exit(1);
      }
      const res = await apiFetch<{ id: string; deleted: boolean }>(
        "DELETE",
        `/api/v1/projects/${encodeURIComponent(id)}/domains/${encodeURIComponent(row.id)}`,
      );
      emit(res, () => console.log(chalk.green(`Removed ${domain} from '${project}'`)));
    });
}

function sslColor(status: string): string {
  switch (status) {
    case "active":
    case "ready":
      return chalk.green(status);
    case "failed":
      return chalk.red(status);
    case "pending":
      return chalk.yellow(status);
    default:
      return chalk.dim(status);
  }
}
