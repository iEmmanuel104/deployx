// Shell metacharacters that must never appear in build/start commands.
// These are rejected even though execFile doesn't spawn a shell, because
// Nixpacks itself may invoke a shell internally to run the command.
const SHELL_METACHAR_PATTERN = /[|&;$`(){}\\<>!]/;

/**
 * Validates a build or start command for shell metacharacters.
 * Throws BuildCommandValidationError if forbidden characters are found.
 *
 * Quotes (single/double) are allowed — Nixpacks handles them correctly
 * when passed as a single argument via execFile.
 */
export function validateBuildCommand(cmd: string): void {
  if (SHELL_METACHAR_PATTERN.test(cmd)) {
    throw new BuildCommandValidationError(
      `Build command contains forbidden shell metacharacter: "${cmd}"`,
    );
  }
}

export class BuildCommandValidationError extends Error {
  readonly code = "BUILD_COMMAND_VALIDATION_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "BuildCommandValidationError";
  }
}
