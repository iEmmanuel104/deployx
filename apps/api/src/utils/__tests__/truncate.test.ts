import { describe, it, expect } from "vitest";
import { truncate } from "../truncate.js";

describe("truncate", () => {
  it("returns the string unchanged when under the cap", () => {
    expect(truncate("hello", 100)).toBe("hello");
  });

  it("returns the string unchanged when exactly at the cap", () => {
    const s = "x".repeat(100);
    expect(truncate(s, 100)).toBe(s);
    expect(Buffer.byteLength(truncate(s, 100), "utf8")).toBe(100);
  });

  it("truncates and appends the marker when over the cap", () => {
    const s = "x".repeat(200);
    const out = truncate(s, 100);
    expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(100);
    expect(out.endsWith("\n[...truncated]")).toBe(true);
  });

  it("handles the empty string", () => {
    expect(truncate("", 64)).toBe("");
  });

  it("preserves the leading prefix when truncating", () => {
    const out = truncate("ERROR: " + "x".repeat(1000), 64);
    expect(out.startsWith("ERROR: ")).toBe(true);
    expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(64);
  });

  it("measures the cap in UTF-8 bytes, not code units", () => {
    // "✓" is 3 bytes in UTF-8 (U+2713). 50 of them = 150 bytes but only
    // 50 code units. A naive `.length`-based truncate would let this slip
    // past a 100-byte cap.
    const s = "✓".repeat(50);
    expect(s.length).toBe(50);
    expect(Buffer.byteLength(s, "utf8")).toBe(150);
    const out = truncate(s, 100);
    expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(100);
    expect(out.endsWith("\n[...truncated]")).toBe(true);
  });

  it("works at the 64 KiB convention used by deployment logs", () => {
    const cap = 64 * 1024;
    const huge = "a".repeat(cap * 3);
    const out = truncate(huge, cap);
    expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(cap);
    expect(out.endsWith("\n[...truncated]")).toBe(true);
  });
});
