import type { Command } from "commander";

export function registerDomainsCommand(program: Command): void {
  const domains = program
    .command("domains")
    .description("Manage custom domains");

  domains
    .command("add")
    .description("Add a custom domain to a project")
    .argument("<project>", "Project name")
    .argument("<domain>", "Domain name")
    .action((project: string, domain: string) => {
      console.log(`Add domain "${domain}" to "${project}" not yet implemented`);
    });

  domains
    .command("remove")
    .description("Remove a custom domain from a project")
    .argument("<project>", "Project name")
    .argument("<domain>", "Domain name")
    .action((project: string, domain: string) => {
      console.log(`Remove domain "${domain}" from "${project}" not yet implemented`);
    });

  domains
    .command("list")
    .description("List custom domains for a project")
    .argument("<project>", "Project name")
    .action((project: string) => {
      console.log(`Domains for "${project}" not yet implemented`);
    });
}
