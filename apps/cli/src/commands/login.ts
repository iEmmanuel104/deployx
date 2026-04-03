import type { Command } from "commander";

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Authenticate with a DeployX server")
    .option("-s, --server <url>", "API server URL")
    .action((_options) => {
      console.log("Login not yet implemented");
    });
}
