import type { Command } from "commander";
import chalk from "chalk";
import { apiStreamSse } from "../lib/api.js";

export function registerLogsCommand(program: Command): void {
  program
    .command("logs")
    .description("Stream container logs for a project")
    .argument("<project>", "Project slug or ULID")
    .option("-f, --follow", "Follow log output (stream new lines as they arrive)", false)
    .option("-n, --lines <n>", "Number of historical lines to show (1-10000)", "200")
    .option("-t, --timestamps", "Prefix each line with the container timestamp", false)
    .addHelpText(
      "after",
      "\nExamples:\n" +
        "  $ deployx logs my-app                  # last 200 lines\n" +
        "  $ deployx logs my-app -f               # tail -f\n" +
        "  $ deployx logs my-app -n 1000 -t       # 1000 lines with timestamps",
    )
    .action(
      async (
        project: string,
        options: { follow?: boolean; lines: string; timestamps?: boolean },
      ) => {
        const params = new URLSearchParams();
        if (options.follow) params.set("follow", "1");
        params.set("tail", options.lines);
        if (options.timestamps) params.set("timestamps", "1");

        const path = `/api/v1/projects/${encodeURIComponent(project)}/logs?${params.toString()}`;

        let stopped = false;
        const cleanup = () => {
          if (!stopped) {
            stopped = true;
            console.log(chalk.dim("\n— stream closed —"));
            process.exit(0);
          }
        };
        process.on("SIGINT", cleanup);
        process.on("SIGTERM", cleanup);

        try {
          for await (const line of apiStreamSse(path)) {
            if (stopped) break;
            process.stdout.write(line + "\n");
          }
        } catch (err) {
          if (!stopped) {
            console.error(
              chalk.red(
                `Log stream error: ${err instanceof Error ? err.message : String(err)}`,
              ),
            );
            process.exit(1);
          }
        }
      },
    );
}
