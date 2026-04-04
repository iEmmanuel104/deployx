import { describe, it, expect } from "vitest";
import {
  validateBuildCommand,
  BuildCommandValidationError,
} from "../validation.js";

describe("validateBuildCommand", () => {
  const forbiddenChars = ["|", "&", ";", "$", "`", "(", ")", "{", "}", "\\", "<", ">", "!"];

  for (const char of forbiddenChars) {
    it(`rejects commands containing "${char}"`, () => {
      expect(() => validateBuildCommand(`npm run build ${char} echo`)).toThrow(
        BuildCommandValidationError,
      );
    });
  }

  it("accepts clean build commands", () => {
    expect(() => validateBuildCommand("npm run build")).not.toThrow();
    expect(() => validateBuildCommand("yarn start")).not.toThrow();
    expect(() => validateBuildCommand("python manage.py runserver")).not.toThrow();
    expect(() => validateBuildCommand("cargo build --release")).not.toThrow();
    expect(() => validateBuildCommand("go build -o main .")).not.toThrow();
  });

  it("allows single and double quotes", () => {
    expect(() => validateBuildCommand("echo 'hello world'")).not.toThrow();
    expect(() => validateBuildCommand('echo "hello world"')).not.toThrow();
  });

  it("allows paths with slashes and dots", () => {
    expect(() => validateBuildCommand("./scripts/build.sh")).not.toThrow();
    expect(() => validateBuildCommand("node ./dist/server.js")).not.toThrow();
  });

  it("throws BuildCommandValidationError with correct code", () => {
    try {
      validateBuildCommand("rm -rf / && echo pwned");
    } catch (err) {
      expect(err).toBeInstanceOf(BuildCommandValidationError);
      expect((err as BuildCommandValidationError).code).toBe(
        "BUILD_COMMAND_VALIDATION_ERROR",
      );
    }
  });
});
