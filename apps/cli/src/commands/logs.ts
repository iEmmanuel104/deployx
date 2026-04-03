import type { Command } from "commander";

export function registerLogsCommand(program: Command): void {
  program
    .command("logs")
    .description("Stream logs for a project")
    .argument("<project>", "Project name")
    .option("-f, --follow", "Follow log output")
    .option("-n, --lines <n>", "Number of lines to show", "100")
    .action((project: string, options: { follow?: boolean; lines: string }) => {
      console.log(
        `Logs for "${project}" (follow=${!!options.follow}, lines=${options.lines}) not yet implemented`,
      );
    });
}
