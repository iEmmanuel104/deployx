import type { JobHandler } from "../processor.js";
import { handleBuildJob } from "./build.js";
import { handleDeployJob } from "./deploy.js";
import { handleStopJob } from "./stop.js";
import { handleRestartJob } from "./restart.js";

export const jobHandlers: Record<string, JobHandler> = {
  build: handleBuildJob,
  deploy: handleDeployJob,
  stop: handleStopJob,
  restart: handleRestartJob,
};
