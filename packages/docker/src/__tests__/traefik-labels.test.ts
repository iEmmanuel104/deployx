import { describe, it, expect } from "vitest";
import { generateTraefikLabels } from "../index.js";

describe("generateTraefikLabels", () => {
  it("generates labels with explicit domain", () => {
    const labels = generateTraefikLabels({
      slug: "myapp",
      domain: "myapp.example.com",
      port: 3000,
    });

    expect(labels["traefik.enable"]).toBe("true");
    expect(labels["traefik.http.routers.myapp.rule"]).toBe(
      "Host(`myapp.example.com`)",
    );
    expect(labels["traefik.http.routers.myapp.entrypoints"]).toBe(
      "websecure",
    );
    expect(labels["traefik.http.routers.myapp.tls"]).toBe("true");
    expect(labels["traefik.http.routers.myapp.tls.certresolver"]).toBe(
      "letsencrypt",
    );
    expect(
      labels["traefik.http.services.myapp.loadbalancer.server.port"],
    ).toBe("3000");
    expect(labels["traefik.http.routers.myapp.middlewares"]).toBe(
      "security-headers@file",
    );
  });

  it("generates subdomain labels from platformDomain", () => {
    const labels = generateTraefikLabels({
      slug: "myapp",
      platformDomain: "deployx.example.com",
      port: 8080,
    });

    expect(labels["traefik.http.routers.myapp.rule"]).toBe(
      "Host(`myapp.deployx.example.com`)",
    );
    expect(
      labels["traefik.http.services.myapp.loadbalancer.server.port"],
    ).toBe("8080");
  });

  it("prefers explicit domain over platformDomain", () => {
    const labels = generateTraefikLabels({
      slug: "myapp",
      domain: "custom.example.com",
      platformDomain: "deployx.example.com",
      port: 3000,
    });

    expect(labels["traefik.http.routers.myapp.rule"]).toBe(
      "Host(`custom.example.com`)",
    );
  });

  it("throws when neither domain nor platformDomain is provided", () => {
    expect(() =>
      generateTraefikLabels({ slug: "myapp", port: 3000 }),
    ).toThrow("either domain or platformDomain must be provided");
  });

  it("adds health check labels when healthCheckPath is set", () => {
    const labels = generateTraefikLabels({
      slug: "myapp",
      domain: "myapp.example.com",
      port: 3000,
      healthCheckPath: "/health",
    });

    expect(
      labels[
        "traefik.http.services.myapp.loadbalancer.healthcheck.path"
      ],
    ).toBe("/health");
    expect(
      labels[
        "traefik.http.services.myapp.loadbalancer.healthcheck.interval"
      ],
    ).toBe("10s");
    expect(
      labels[
        "traefik.http.services.myapp.loadbalancer.healthcheck.timeout"
      ],
    ).toBe("5s");
  });

  it("does not add health check labels when path is not set", () => {
    const labels = generateTraefikLabels({
      slug: "myapp",
      domain: "myapp.example.com",
      port: 3000,
    });

    expect(
      labels[
        "traefik.http.services.myapp.loadbalancer.healthcheck.path"
      ],
    ).toBeUndefined();
  });

  it("applies custom middleware list", () => {
    const labels = generateTraefikLabels({
      slug: "myapp",
      domain: "myapp.example.com",
      port: 3000,
      middlewares: ["security-headers@file", "rate-limit@file"],
    });

    expect(labels["traefik.http.routers.myapp.middlewares"]).toBe(
      "security-headers@file,rate-limit@file",
    );
  });

  it("defaults to security-headers@file middleware", () => {
    const labels = generateTraefikLabels({
      slug: "myapp",
      domain: "myapp.example.com",
      port: 3000,
    });

    expect(labels["traefik.http.routers.myapp.middlewares"]).toBe(
      "security-headers@file",
    );
  });
});
