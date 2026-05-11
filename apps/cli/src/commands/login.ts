import type { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import { config } from "../lib/config.js";

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Authenticate with a DeployX server")
    .option("-s, --server <url>", "API server URL (e.g. https://deploy.example.com)")
    .option("-e, --email <email>", "Email (skips prompt)")
    .action(async (options: { server?: string; email?: string }) => {
      const rl = createInterface({ input, output });

      let server = options.server ?? (config.get("server") as string | undefined);
      if (!server) {
        server = (await rl.question("DeployX server URL: ")).trim();
      }
      server = server.replace(/\/$/, "");

      const email = options.email ?? (await rl.question("Email: ")).trim();
      // password — read with terminal echo off
      output.write("Password: ");
      const password = await readPasswordSilently();
      rl.close();

      const res = await fetch(`${server}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const env = (await res.json()) as {
        ok: boolean;
        data?: { accessToken: string; refreshToken: string; user: { email: string } };
        error?: { message?: string };
      };

      if (!env.ok || !env.data) {
        console.error(chalk.red(`Login failed: ${env.error?.message ?? res.statusText}`));
        process.exit(1);
      }

      config.set("server", server);
      config.set("accessToken", env.data.accessToken);
      config.set("refreshToken", env.data.refreshToken);
      config.set("userEmail", env.data.user.email);

      console.log(chalk.green(`Logged in as ${env.data.user.email} at ${server}`));
    });
}

async function readPasswordSilently(): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode?.(true);
    stdin.resume();
    let pwd = "";
    const onData = (chunk: Buffer): void => {
      const s = chunk.toString("utf8");
      for (const ch of s) {
        if (ch === "\r" || ch === "\n") {
          stdin.off("data", onData);
          stdin.setRawMode?.(wasRaw ?? false);
          stdin.pause();
          process.stdout.write("\n");
          resolve(pwd);
          return;
        }
        if (ch === "") {
          // Ctrl-C
          process.stdout.write("\n");
          process.exit(130);
        }
        if (ch === "" || ch === "\b") {
          pwd = pwd.slice(0, -1);
        } else {
          pwd += ch;
        }
      }
    };
    stdin.on("data", onData);
  });
}
