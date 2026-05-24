import type { Command } from "commander";
import chalk from "chalk";
import { apiFetch } from "../lib/api.js";
import { emit, failJson, isJsonMode } from "../lib/output.js";
import { resolveProjectId } from "../lib/projects.js";

interface DeploymentRow {
  id: string;
  projectId: string;
  version: number;
  trigger: string;
  commitSha: string | null;
  commitMsg: string | null;
  imageTag: string | null;
  status: string;
  buildLog: string | null;
  errorMsg: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export function registerDeploymentsCommand(program: Command): void {
  const deployments = program
    .command("deployments")
    .description("List and inspect project deployments");

  deployments
    .command("list")
    .description("List all deployments for a project (newest first)")
    .argument("<project>", "Project slug or ULID")
    .addHelpText(
      "after",
      "\nExamples:\n" +
        "  $ deployx deployments list my-app\n" +
        "  $ deployx deployments list my-app --json",
    )
    .action(async (project: string) => {
      const projectId = await resolveProjectId(project);
      const rows = await apiFetch<DeploymentRow[]>(
        "GET",
        `/api/v1/projects/${encodeURIComponent(projectId)}/deployments`,
        undefined,
        { notFoundLabel: project },
      );

      emit(rows, (data) => {
        if (data.length === 0) {
          console.log(
            chalk.dim(
              `No deployments yet for '${project}'. Trigger one with \`deployx deploy ${project}\`.`,
            ),
          );
          return;
        }
        const verWidth = Math.max(
          ...data.map((d) => String(d.version).length),
          3,
        );
        const statusWidth = Math.max(...data.map((d) => d.status.length), 8);
        console.log(
          `${chalk.bold("VER".padStart(verWidth))}  ` +
            `${chalk.bold("STATUS".padEnd(statusWidth))}  ` +
            `${chalk.bold("CREATED".padEnd(20))}  ` +
            `${chalk.bold("COMMIT")}`,
        );
        for (const d of data) {
          const commit = d.commitSha ? d.commitSha.slice(0, 7) : "-";
          console.log(
            `${String(d.version).padStart(verWidth)}  ` +
              `${statusColor(d.status).padEnd(statusWidth)}  ` +
              `${formatDate(d.createdAt).padEnd(20)}  ` +
              `${chalk.dim(commit)}`,
          );
        }
      });
    });

  deployments
    .command("show")
    .description("Show full detail for a single deployment by version")
    .argument("<project>", "Project slug or ULID")
    .argument("<version>", "Deployment version number (e.g. 7)")
    .addHelpText(
      "after",
      "\nExamples:\n  $ deployx deployments show my-app 7\n  $ deployx deployments show my-app 7 --json",
    )
    .action(async (project: string, version: string) => {
      const versionNum = Number(version);
      if (!Number.isInteger(versionNum) || versionNum < 1) {
        const msg = `Invalid input: <version> must be a positive integer, got '${version}'`;
        if (isJsonMode()) failJson({ code: "INVALID_INPUT", message: msg }, 1);
        console.error(msg);
        process.exit(1);
      }

      const projectId = await resolveProjectId(project);
      const list = await apiFetch<DeploymentRow[]>(
        "GET",
        `/api/v1/projects/${encodeURIComponent(projectId)}/deployments`,
        undefined,
        { notFoundLabel: project },
      );
      const target = list.find((d) => d.version === versionNum);
      if (!target) {
        const msg = `No deployment with version ${versionNum} for '${project}'.`;
        if (isJsonMode()) failJson({ code: "NOT_FOUND", message: msg }, 1);
        console.error(msg);
        process.exit(1);
      }

      // Fetch the full row by id — keeps the source of truth on the server in
      // case list ever returns a slimmer projection.
      const full = await apiFetch<DeploymentRow>(
        "GET",
        `/api/v1/projects/${encodeURIComponent(projectId)}/deployments/${encodeURIComponent(target.id)}`,
        undefined,
        { notFoundLabel: project },
      );

      emit(full, (d) => {
        console.log(`${chalk.bold("Deployment")} ${chalk.dim(d.id)}`);
        console.log(`  Version:    ${d.version}`);
        console.log(`  Status:     ${statusColor(d.status)}`);
        console.log(`  Trigger:    ${d.trigger}`);
        console.log(`  Created:    ${formatDate(d.createdAt)}`);
        if (d.startedAt) console.log(`  Started:    ${formatDate(d.startedAt)}`);
        if (d.finishedAt) console.log(`  Finished:   ${formatDate(d.finishedAt)}`);
        if (d.commitSha) console.log(`  Commit:     ${d.commitSha}`);
        if (d.commitMsg) console.log(`  Message:    ${d.commitMsg}`);
        if (d.imageTag) console.log(`  Image:      ${d.imageTag}`);
        if (d.errorMsg) {
          console.log(chalk.red(`  Error:      ${d.errorMsg}`));
        }
      });
    });
}

function statusColor(status: string): string {
  switch (status) {
    case "success":
    case "running":
      return chalk.green(status);
    case "building":
    case "queued":
      return chalk.yellow(status);
    case "failed":
      return chalk.red(status);
    case "stopped":
      return chalk.dim(status);
    default:
      return status;
  }
}

function formatDate(iso: string): string {
  // Compact ISO without milliseconds for table display.
  return iso.replace("T", " ").replace(/\.\d+Z$/, "Z");
}
