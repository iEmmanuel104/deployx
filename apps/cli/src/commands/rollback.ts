import type { Command } from "commander";

export function registerRollbackCommand(program: Command): void {
  program
    .command("rollback")
    .description("Rollback a project to a previous version")
    .argument("<project>", "Project name")
    .argument("<version>", "Version or deployment ID to rollback to")
    .action((project: string, version: string) => {
      console.log(
        `Rollback "${project}" to version "${version}" not yet implemented`,
      );
    });
}
