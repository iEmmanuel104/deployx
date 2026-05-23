import type { Command } from "commander";
import chalk from "chalk";
import { apiFetch } from "../lib/api.js";
import { emit } from "../lib/output.js";

interface GcResult {
  buildsDir: string;
  scanned: number;
  kept: number;
  removed: number;
  bytesFreed: number;
  removedPaths: string[];
  errors: Array<{ path: string; message: string }>;
}

export function registerBuildsCommand(program: Command): void {
  const builds = program.command("builds").description("Manage build artifacts");

  builds
    .command("gc")
    .description("Garbage-collect old build artifacts on the server")
    .option("-k, --keep <n>", "Number of builds to keep per project", "5")
    .option("--dry-run", "Report what would be removed without deleting")
    .addHelpText(
      "after",
      "\nExamples:\n" +
        "  $ deployx builds gc                  # keep 5 per project\n" +
        "  $ deployx builds gc --keep 10\n" +
        "  $ deployx builds gc --dry-run        # preview without deleting",
    )
    .action(async (options: { keep: string; dryRun?: boolean }) => {
      const params = new URLSearchParams({ keep: options.keep });
      if (options.dryRun) params.set("dryRun", "1");

      const result = await apiFetch<GcResult>(
        "POST",
        `/api/v1/system/gc?${params.toString()}`,
      );

      emit(result, (r) => {
        const verb = options.dryRun ? chalk.yellow("[DRY RUN]") : chalk.green("Removed");
        console.log(`${chalk.bold("Build GC")} — ${r.buildsDir}`);
        console.log(`  Scanned:     ${r.scanned}`);
        console.log(`  Kept:        ${r.kept}`);
        console.log(`  ${verb}:     ${r.removed}`);
        console.log(`  Bytes freed: ${formatBytes(r.bytesFreed)}`);
        if (r.errors.length > 0) {
          console.log(chalk.red(`  Errors: ${r.errors.length}`));
          for (const e of r.errors) console.log(chalk.red(`    ${e.path}: ${e.message}`));
        }
      });
    });
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
