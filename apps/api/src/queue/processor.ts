import { eq, and, asc, sql } from "drizzle-orm";
import type { DeployxDb } from "@deployx/db";
import { buildJobs } from "@deployx/db";
import type { FastifyBaseLogger } from "fastify";

export interface JobContext {
  job: typeof buildJobs.$inferSelect;
  db: DeployxDb;
  logger: FastifyBaseLogger;
}

export type JobHandler = (ctx: JobContext) => Promise<void>;

export interface QueueProcessorOpts {
  db: DeployxDb;
  logger: FastifyBaseLogger;
  pollIntervalMs?: number;
  baseRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  handlers: Partial<Record<string, JobHandler>>;
}

export class QueueProcessor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private currentJob: Promise<void> | null = null;
  private shuttingDown = false;

  private readonly pollIntervalMs: number;
  private readonly baseRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;

  constructor(private readonly opts: QueueProcessorOpts) {
    this.pollIntervalMs = opts.pollIntervalMs ?? 2000;
    this.baseRetryDelayMs = opts.baseRetryDelayMs ?? 5000;
    this.maxRetryDelayMs = opts.maxRetryDelayMs ?? 300_000;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.shuttingDown = false;
    this.opts.logger.info(
      `Job queue started (poll every ${String(this.pollIntervalMs)}ms)`,
    );
    this.timer = setInterval(
      () => void this.poll(),
      this.pollIntervalMs,
    );
    void this.poll();
  }

  async stop(): Promise<void> {
    this.shuttingDown = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.currentJob) {
      this.opts.logger.info("Waiting for current job to finish...");
      await this.currentJob;
    }
    this.running = false;
    this.opts.logger.info("Job queue stopped.");
  }

  isRunning(): boolean {
    return this.running;
  }

  private async poll(): Promise<void> {
    if (this.shuttingDown || this.currentJob) return;

    try {
      const job = await this.claimNextJob();
      if (!job) return;

      this.currentJob = this.executeJob(job);
      await this.currentJob;
    } catch (err) {
      this.opts.logger.error({ err }, "Queue poll error");
    } finally {
      this.currentJob = null;
    }
  }

  private async claimNextJob(): Promise<
    typeof buildJobs.$inferSelect | null
  > {
    const now = new Date().toISOString();

    // Find oldest pending job eligible for processing
    const pendingJobs = await this.opts.db
      .select()
      .from(buildJobs)
      .where(eq(buildJobs.status, "pending"))
      .orderBy(asc(buildJobs.createdAt))
      .limit(5);

    // Filter for retry eligibility in JS (simpler than SQLite date math)
    const eligible = pendingJobs.find((job) => {
      if (!job.finishedAt) return true; // Never attempted
      const finishedMs = new Date(job.finishedAt).getTime();
      const attempts = job.attempts ?? 0;
      const delay = Math.min(
        this.baseRetryDelayMs * Math.pow(2, attempts),
        this.maxRetryDelayMs,
      );
      return Date.now() >= finishedMs + delay;
    });

    if (!eligible) return null;

    // Atomic claim: CAS — only if still pending
    const result = await this.opts.db
      .update(buildJobs)
      .set({
        status: "running",
        startedAt: now,
        attempts: sql`${buildJobs.attempts} + 1`,
      })
      .where(
        and(
          eq(buildJobs.id, eligible.id),
          eq(buildJobs.status, "pending"),
        ),
      )
      .returning();

    return result[0] ?? null;
  }

  private async executeJob(
    job: typeof buildJobs.$inferSelect,
  ): Promise<void> {
    const handler = this.opts.handlers[job.type];
    if (!handler) {
      await this.markFailed(
        job.id,
        `Unknown job type: ${job.type}`,
      );
      return;
    }

    try {
      this.opts.logger.info(
        { jobId: job.id, type: job.type },
        "Processing job",
      );

      await handler({
        job,
        db: this.opts.db,
        logger: this.opts.logger,
      });

      await this.markDone(job.id);
      this.opts.logger.info(
        { jobId: job.id, type: job.type },
        "Job completed",
      );
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : String(err);
      const attempts = job.attempts ?? 0;
      const maxAttempts = job.maxAttempts ?? 3;

      this.opts.logger.error(
        { jobId: job.id, type: job.type, attempts, maxAttempts, err },
        "Job failed",
      );

      if (attempts >= maxAttempts) {
        await this.markFailed(job.id, errorMsg);
      } else {
        await this.markPendingForRetry(job.id, errorMsg);
      }
    }
  }

  private async markDone(jobId: string): Promise<void> {
    await this.opts.db
      .update(buildJobs)
      .set({
        status: "done",
        finishedAt: new Date().toISOString(),
      })
      .where(eq(buildJobs.id, jobId));
  }

  private async markFailed(
    jobId: string,
    error: string,
  ): Promise<void> {
    await this.opts.db
      .update(buildJobs)
      .set({
        status: "failed",
        error,
        finishedAt: new Date().toISOString(),
      })
      .where(eq(buildJobs.id, jobId));
  }

  private async markPendingForRetry(
    jobId: string,
    error: string,
  ): Promise<void> {
    await this.opts.db
      .update(buildJobs)
      .set({
        status: "pending",
        error,
        finishedAt: new Date().toISOString(),
      })
      .where(eq(buildJobs.id, jobId));
  }
}
