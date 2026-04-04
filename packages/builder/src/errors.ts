export class BuildError extends Error {
  readonly code: string;
  readonly buildLog?: string;

  constructor(code: string, message: string, buildLog?: string) {
    super(message);
    this.name = "BuildError";
    this.code = code;
    this.buildLog = buildLog;
  }
}

export class NixpacksBuildError extends BuildError {
  constructor(message: string, buildLog?: string) {
    super("NIXPACKS_BUILD_FAILED", message, buildLog);
    this.name = "NixpacksBuildError";
  }
}

export class GitCloneError extends BuildError {
  constructor(message: string) {
    super("GIT_CLONE_FAILED", message);
    this.name = "GitCloneError";
  }
}
