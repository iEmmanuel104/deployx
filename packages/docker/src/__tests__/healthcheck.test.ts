import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDocker } from "./setup.js";
import {
  DockerClient,
  parseDuration,
  healthCheckToDockerOpts,
} from "../index.js";

let mockDocker: ReturnType<typeof createMockDocker>;

vi.mock("dockerode", () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return mockDocker;
    }),
  };
});

describe("parseDuration", () => {
  it("converts seconds", () => {
    expect(parseDuration("30s")).toBe(30_000_000_000);
    expect(parseDuration("1s")).toBe(1_000_000_000);
  });

  it("converts minutes", () => {
    expect(parseDuration("5m")).toBe(300_000_000_000);
  });

  it("converts hours", () => {
    expect(parseDuration("1h")).toBe(3_600_000_000_000);
  });

  it("converts milliseconds", () => {
    expect(parseDuration("100ms")).toBe(100_000_000);
    expect(parseDuration("500ms")).toBe(500_000_000);
  });

  it("throws on invalid format", () => {
    expect(() => parseDuration("30")).toThrow('Invalid duration: "30"');
    expect(() => parseDuration("abc")).toThrow('Invalid duration: "abc"');
    expect(() => parseDuration("1d")).toThrow('Invalid duration: "1d"');
    expect(() => parseDuration("")).toThrow('Invalid duration: ""');
  });
});

describe("healthCheckToDockerOpts", () => {
  it("converts HealthCheck config to Docker format", () => {
    const result = healthCheckToDockerOpts({
      path: "/health",
      interval: "30s",
      timeout: "5s",
      retries: 3,
    });

    expect(result.test).toEqual([
      "CMD-SHELL",
      "wget --no-verbose --tries=1 --spider http://localhost/health || exit 1",
    ]);
    expect(result.interval).toBe(30_000_000_000);
    expect(result.timeout).toBe(5_000_000_000);
    expect(result.retries).toBe(3);
    expect(result.startPeriod).toBe(0);
  });

  it("handles custom path", () => {
    const result = healthCheckToDockerOpts({
      path: "/api/v1/ready",
      interval: "10s",
      timeout: "3s",
      retries: 5,
    });

    expect(result.test[1]).toContain("/api/v1/ready");
  });
});

describe("DockerClient — Health Check in Container", () => {
  let client: DockerClient;

  beforeEach(() => {
    mockDocker = createMockDocker();
    client = new DockerClient({ host: "localhost", port: 2375 });
  });

  it("passes Healthcheck when provided", async () => {
    await client.createAndStartContainer({
      name: "test",
      image: "myapp:latest",
      healthcheck: {
        test: ["CMD-SHELL", "wget -q http://localhost:3000/health || exit 1"],
        interval: 30_000_000_000,
        timeout: 5_000_000_000,
        retries: 3,
        startPeriod: 10_000_000_000,
      },
    });

    const createCall = mockDocker.createContainer.mock.calls[0]![0];
    expect(createCall.Healthcheck).toEqual({
      Test: ["CMD-SHELL", "wget -q http://localhost:3000/health || exit 1"],
      Interval: 30_000_000_000,
      Timeout: 5_000_000_000,
      Retries: 3,
      StartPeriod: 10_000_000_000,
    });
  });

  it("omits Healthcheck when not provided", async () => {
    await client.createAndStartContainer({
      name: "test",
      image: "myapp:latest",
    });

    const createCall = mockDocker.createContainer.mock.calls[0]![0];
    expect(createCall.Healthcheck).toBeUndefined();
  });
});
