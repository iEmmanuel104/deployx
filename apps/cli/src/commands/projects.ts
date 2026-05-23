import type { Command } from "commander";
import chalk from "chalk";
import { ulid } from "ulidx";
import { apiFetch } from "../lib/api.js";
import { emit } from "../lib/output.js";
import { resolveProjectId, type ProjectRow } from "../lib/projects.js";

interface DeployResult {
  deploymentId: string;
  jobId: string;
}

export function registerProjectsCommand(program: Command): void {
  const projects = program
    .command("projects")
    .description("List, create, and delete projects");

  projects
    .command("list")
    .description("List all projects you own")
    .addHelpText("after", "\nExamples:\n  $ deployx projects list\n  $ deployx projects list --json")
    .action(async () => {
      const rows = await apiFetch<ProjectRow[]>("GET", "/api/v1/projects");
      emit(rows, (data) => {
        if (data.length === 0) {
          console.log(chalk.dim("No projects yet. Create one with `deployx projects create`."));
          return;
        }
        const w = Math.max(...data.map((p) => p.slug.length), 4);
        console.log(
          `${chalk.bold("SLUG".padEnd(w))}  ${chalk.bold("STATUS".padEnd(10))}  ${chalk.bold("BUILD".padEnd(10))}  ${chalk.bold("ID")}`,
        );
        for (const p of data) {
          console.log(
            `${p.slug.padEnd(w)}  ${statusColor(p.status).padEnd(10)}  ${(p.buildType ?? "-").padEnd(10)}  ${chalk.dim(p.id)}`,
          );
        }
      });
    });

  projects
    .command("create")
    .description("Create a new project")
    .argument("<slug>", "URL-safe slug (a-z, 0-9, hyphen, max 48 chars)")
    .option("-n, --name <name>", "Human-readable name (defaults to slug)")
    .option(
      "-s, --source <type>",
      "Source type: git | zip | image | cli",
      "git",
    )
    .option("-r, --git-repo <url>", "Git repository URL (required if source=git)")
    .option("-b, --git-branch <branch>", "Git branch", "main")
    .option(
      "-t, --build <type>",
      "Build type: nixpacks | railpack | dockerfile",
      "nixpacks",
    )
    .option("-p, --port <port>", "Container port the app listens on", "3000")
    .addHelpText(
      "after",
      "\nExamples:\n" +
        "  $ deployx projects create my-app --git-repo https://github.com/me/my-app\n" +
        "  $ deployx projects create api --git-repo https://github.com/me/api --build dockerfile --port 8080",
    )
    .action(
      async (
        slug: string,
        options: {
          name?: string;
          source: string;
          gitRepo?: string;
          gitBranch: string;
          build: string;
          port: string;
        },
      ) => {
        const body = {
          name: options.name ?? slug,
          slug,
          source_type: options.source,
          git_repo: options.gitRepo,
          git_branch: options.gitBranch,
          build_type: options.build,
          port: Number(options.port),
        };
        const created = await apiFetch<ProjectRow>("POST", "/api/v1/projects", body);
        emit(created, (p) => {
          console.log(chalk.green(`Created project '${p.slug}'`) + chalk.dim(` (${p.id})`));
          console.log(`  Build:  ${p.buildType}`);
          if (p.gitRepo) console.log(`  Repo:   ${p.gitRepo}@${p.gitBranch ?? "main"}`);
          console.log(`  Port:   ${p.port}`);
          console.log(chalk.dim(`\nDeploy with: deployx deploy ${p.slug}`));
        });
      },
    );

  projects
    .command("delete")
    .description("Soft-delete a project")
    .argument("<project>", "Project slug or ULID")
    .option("-y, --yes", "Skip confirmation prompt")
    .addHelpText("after", "\nExamples:\n  $ deployx projects delete my-app\n  $ deployx projects delete my-app --yes")
    .action(async (project: string, options: { yes?: boolean }) => {
      if (!options.yes) {
        process.stdout.write(
          chalk.yellow(
            `About to soft-delete '${project}'. Pass --yes to confirm.\n`,
          ),
        );
        process.exit(1);
      }
      const id = await resolveProjectId(project);
      const res = await apiFetch<{ id: string; deleted: boolean }>(
        "DELETE",
        `/api/v1/projects/${encodeURIComponent(id)}`,
        undefined,
        { notFoundLabel: project },
      );
      emit(res, () => console.log(chalk.green(`Deleted project '${project}'`)));
    });
}

export function registerDeployCommand(program: Command): void {
  program
    .command("deploy")
    .description("Trigger a deploy for a project")
    .argument("<project>", "Project slug or ULID")
    .addHelpText(
      "after",
      "\nExamples:\n  $ deployx deploy my-app\n  $ deployx deploy 01HBX...  # by ULID\n  $ deployx deploy my-app --json",
    )
    .action(async (project: string) => {
      const id = await resolveProjectId(project);
      const res = await apiFetch<DeployResult>(
        "POST",
        `/api/v1/projects/${encodeURIComponent(id)}/deploy`,
        {},
        { notFoundLabel: project, idempotencyKey: ulid() },
      );
      emit(res, (r) => {
        console.log(chalk.green(`Deploy queued for '${project}'`));
        console.log(`  Deployment: ${r.deploymentId}`);
        console.log(`  Job:        ${r.jobId}`);
        console.log(chalk.dim(`\nFollow logs with: deployx logs ${project} -f`));
      });
    });
}

export function registerStopCommand(program: Command): void {
  program
    .command("stop")
    .description("Stop a running project's container")
    .argument("<project>", "Project slug or ULID")
    .addHelpText("after", "\nExamples:\n  $ deployx stop my-app")
    .action(async (project: string) => {
      const id = await resolveProjectId(project);
      const res = await apiFetch<DeployResult>(
        "POST",
        `/api/v1/projects/${encodeURIComponent(id)}/stop`,
        {},
        { notFoundLabel: project, idempotencyKey: ulid() },
      );
      emit(res, (r) => {
        console.log(chalk.green(`Stop queued for '${project}'`));
        console.log(chalk.dim(`  Deployment: ${r.deploymentId}`));
      });
    });
}

export function registerRestartCommand(program: Command): void {
  program
    .command("restart")
    .description("Restart a running project's container")
    .argument("<project>", "Project slug or ULID")
    .addHelpText("after", "\nExamples:\n  $ deployx restart my-app")
    .action(async (project: string) => {
      const id = await resolveProjectId(project);
      const res = await apiFetch<DeployResult>(
        "POST",
        `/api/v1/projects/${encodeURIComponent(id)}/restart`,
        {},
        { notFoundLabel: project, idempotencyKey: ulid() },
      );
      emit(res, (r) => {
        console.log(chalk.green(`Restart queued for '${project}'`));
        console.log(chalk.dim(`  Deployment: ${r.deploymentId}`));
      });
    });
}

function statusColor(status: string): string {
  switch (status) {
    case "running":
      return chalk.green(status);
    case "failed":
    case "crashed":
      return chalk.red(status);
    case "building":
    case "deploying":
    case "queued":
      return chalk.yellow(status);
    default:
      return chalk.dim(status);
  }
}
