import type { Command } from "commander";

export function registerProjectsCommand(program: Command): void {
  const projects = program
    .command("projects")
    .description("Manage projects");

  projects
    .command("list")
    .description("List all projects")
    .action(() => {
      console.log("Projects list not yet implemented");
    });

  projects
    .command("create")
    .description("Create a new project")
    .argument("<name>", "Project name")
    .action((name: string) => {
      console.log(`Create project "${name}" not yet implemented`);
    });
}

export function registerDeployCommand(program: Command): void {
  program
    .command("deploy")
    .description("Deploy current directory")
    .option("-p, --project <name>", "Project name")
    .action((options: { project?: string }) => {
      console.log(
        `Deploy ${options.project ? `project "${options.project}"` : "current directory"} not yet implemented`,
      );
    });
}

export function registerStopCommand(program: Command): void {
  program
    .command("stop")
    .description("Stop a project")
    .argument("<project>", "Project name")
    .action((project: string) => {
      console.log(`Stop project "${project}" not yet implemented`);
    });
}

export function registerRestartCommand(program: Command): void {
  program
    .command("restart")
    .description("Restart a project")
    .argument("<project>", "Project name")
    .action((project: string) => {
      console.log(`Restart project "${project}" not yet implemented`);
    });
}
