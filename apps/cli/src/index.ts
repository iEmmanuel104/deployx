#!/usr/bin/env node

import { Command, Option } from "commander";
import { registerLoginCommand } from "./commands/login.js";
import {
  registerProjectsCommand,
  registerDeployCommand,
  registerStopCommand,
  registerRestartCommand,
} from "./commands/projects.js";
import { registerLogsCommand } from "./commands/logs.js";
import { registerEnvCommand } from "./commands/env.js";
import { registerDomainsCommand } from "./commands/domains.js";
import { registerRollbackCommand } from "./commands/rollback.js";
import { registerBuildsCommand } from "./commands/builds.js";
import { registerDeploymentsCommand } from "./commands/deployments.js";
import { setJsonMode } from "./lib/output.js";

const program = new Command();

program
  .name("deployx")
  .description("DeployX — self-hosted deployment platform CLI")
  .version("0.1.0")
  .addOption(
    new Option(
      "--json",
      "Emit raw JSON instead of decorated output (for scripts)",
    ).default(false),
  )
  // commander dispatches subcommand actions after parsing globals; preAction
  // lets us flip the singleton flag before any apiFetch fires.
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.optsWithGlobals() as { json?: boolean };
    if (opts.json) setJsonMode(true);
  });

registerLoginCommand(program);
registerProjectsCommand(program);
registerDeployCommand(program);
registerStopCommand(program);
registerRestartCommand(program);
registerLogsCommand(program);
registerEnvCommand(program);
registerDomainsCommand(program);
registerRollbackCommand(program);
registerBuildsCommand(program);
registerDeploymentsCommand(program);

program.parse(process.argv);
