import type { Command } from "commander";
import chalk from "chalk";
import { ulid } from "ulidx";
import { apiFetch } from "../lib/api.js";
import { emit, failJson, isJsonMode } from "../lib/output.js";
import { looksLikeUlid, resolveProjectId } from "../lib/projects.js";

interface DeploymentRow {
  id: string;
  projectId: string;
  version: number;
  trigger: string;
  imageTag: string | null;
  status: string;
  createdAt: string;
}

export function registerRollbackCommand(program: Command): void {
  program
    .command("rollback")
    .description("Roll a project back to a previous successful deployment")
    .argument("<project>", "Project slug or ULID")
    .argument(
      "<version>",
      "Deployment version number (e.g. 7) or deployment ULID",
    )
    .addHelpText(
      "after",
      "\nExamples:\n" +
        "  $ deployx rollback my-app 7              # by version number\n" +
        "  $ deployx rollback my-app 01HBX...       # by deployment ULID\n" +
        "\nList past deployments via: deployx projects list  (then GET /deployments)",
    )
    .action(async (project: string, version: string) => {
      const projectId = await resolveProjectId(project);

      let deploymentId: string;
      if (looksLikeUlid(version)) {
        deploymentId = version;
      } else {
        const versionNum = Number(version);
        if (!Number.isInteger(versionNum) || versionNum < 1) {
          const msg = `Invalid input: <version> must be a positive integer or a deployment ULID, got '${version}'`;
          if (isJsonMode()) failJson({ code: "INVALID_INPUT", message: msg }, 1);
          console.error(msg);
          process.exit(1);
        }
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
        deploymentId = target.id;
      }

      const res = await apiFetch<{ deploymentId: string; jobId: string }>(
        "POST",
        `/api/v1/projects/${encodeURIComponent(projectId)}/deployments/${encodeURIComponent(deploymentId)}/rollback`,
        {},
        { notFoundLabel: project, idempotencyKey: ulid() },
      );
      emit(res, (r) => {
        console.log(chalk.green(`Rollback queued for '${project}' to ${version}`));
        console.log(chalk.dim(`  Deployment: ${r.deploymentId}`));
        console.log(chalk.dim(`  Job:        ${r.jobId}`));
      });
    });
}
