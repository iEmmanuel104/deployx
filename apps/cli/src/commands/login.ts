import type { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import { config } from "../lib/config.js";
import { emit, failJson, isJsonMode } from "../lib/output.js";

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Authenticate with a DeployX server and persist tokens locally")
    .option("-s, --server <url>", "API server URL (e.g. https://deploy.example.com)")
    .option("-e, --email <email>", "Email (skips the email prompt)")
    .option("-p, --password <password>", "Password (skips the prompt — useful for scripts)")
    .addHelpText(
      "after",
      "\nExamples:\n" +
        "  $ deployx login --server https://deploy.example.com\n" +
        "  $ deployx login -s https://deploy.example.com -e me@example.com\n" +
        "  $ deployx login -s ... -e me@example.com -p \"$DEPLOYX_PASSWORD\" --json",
    )
    .action(async (options: { server?: string; email?: string; password?: string }) => {
      const rl = createInterface({ input, output });

      let server = options.server ?? (config.get("server") as string | undefined);
      if (!server) {
        server = (await rl.question("DeployX server URL: ")).trim();
      }
      server = server.replace(/\/$/, "");

      const email = options.email ?? (await rl.question("Email: ")).trim();

      let password = options.password;
      if (!password) {
        output.write("Password: ");
        password = await readPasswordSilently();
      }
      rl.close();

      let res: Response;
      try {
        res = await fetch(`${server}/api/v1/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
      } catch (err) {
        const msg = `Cannot reach ${server} (${err instanceof Error ? err.message : String(err)})`;
        if (isJsonMode()) failJson({ code: "NETWORK", message: msg }, 3);
        console.error(chalk.red(msg));
        process.exit(3);
      }

      const env = (await res.json()) as {
        ok: boolean;
        data?: { accessToken: string; refreshToken: string; user: { email: string } };
        error?: { message?: string; code?: string };
      };

      if (!env.ok || !env.data) {
        const msg = env.error?.message ?? res.statusText;
        if (isJsonMode()) {
          failJson({ code: env.error?.code ?? "LOGIN_FAILED", message: `Login failed: ${msg}` }, 2);
        }
        console.error(chalk.red(`Login failed: ${msg}`));
        process.exit(2);
      }

      config.set("server", server);
      config.set("accessToken", env.data.accessToken);
      config.set("refreshToken", env.data.refreshToken);
      config.set("userEmail", env.data.user.email);

      emit(
        { server, userEmail: env.data.user.email },
        (d) => console.log(chalk.green(`Logged in as ${d.userEmail} at ${d.server}`)),
      );
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
