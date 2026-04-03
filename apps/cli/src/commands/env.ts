import type { Command } from "commander";

export function registerEnvCommand(program: Command): void {
  const env = program
    .command("env")
    .description("Manage environment variables");

  env
    .command("list")
    .description("List environment variables for a project")
    .argument("<project>", "Project name")
    .action((project: string) => {
      console.log(`Env list for "${project}" not yet implemented`);
    });

  env
    .command("set")
    .description("Set an environment variable")
    .argument("<project>", "Project name")
    .argument("<KEY=VALUE>", "Environment variable in KEY=VALUE format")
    .action((project: string, keyValue: string) => {
      console.log(`Env set "${keyValue}" for "${project}" not yet implemented`);
    });

  env
    .command("delete")
    .description("Delete an environment variable")
    .argument("<project>", "Project name")
    .argument("<key>", "Variable key to delete")
    .action((project: string, key: string) => {
      console.log(`Env delete "${key}" for "${project}" not yet implemented`);
    });
}
