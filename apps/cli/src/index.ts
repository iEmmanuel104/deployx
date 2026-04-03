#!/usr/bin/env node

import { Command } from "commander";
import { registerLoginCommand } from "./commands/login.js";
import { registerProjectsCommand, registerDeployCommand, registerStopCommand, registerRestartCommand } from "./commands/projects.js";
import { registerLogsCommand } from "./commands/logs.js";
import { registerEnvCommand } from "./commands/env.js";
import { registerDomainsCommand } from "./commands/domains.js";
import { registerRollbackCommand } from "./commands/rollback.js";

const program = new Command();

program
  .name("deployx")
  .description("DeployX — self-hosted deployment platform CLI")
  .version("0.1.0");

registerLoginCommand(program);
registerProjectsCommand(program);
registerDeployCommand(program);
registerStopCommand(program);
registerRestartCommand(program);
registerLogsCommand(program);
registerEnvCommand(program);
registerDomainsCommand(program);
registerRollbackCommand(program);

program.parse(process.argv);
