import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { encrypt, decrypt, deriveProjectKey, parseEncryptionKey } from "../index.js";

function generateKey(): Buffer {
  return randomBytes(32);
}

describe("encrypt / decrypt", () => {
  it("round-trip produces original plaintext", () => {
    const key = generateKey();
    const plaintext = "DATABASE_URL=postgres://localhost:5432/mydb";
    const { ciphertext, iv } = encrypt(plaintext, key);
    const result = decrypt(ciphertext, iv, key);
    expect(result).toBe(plaintext);
  });

  it("round-trip works with empty string", () => {
    const key = generateKey();
    const plaintext = "";
    const { ciphertext, iv } = encrypt(plaintext, key);
    const result = decrypt(ciphertext, iv, key);
    expect(result).toBe(plaintext);
  });

  it("round-trip works with unicode content", () => {
    const key = generateKey();
    const plaintext = "SECRET=hello-world-🔐-résumé";
    const { ciphertext, iv } = encrypt(plaintext, key);
    const result = decrypt(ciphertext, iv, key);
    expect(result).toBe(plaintext);
  });

  it("decrypt with wrong key throws", () => {
    const key1 = generateKey();
    const key2 = generateKey();
    const { ciphertext, iv } = encrypt("secret-value", key1);
    expect(() => decrypt(ciphertext, iv, key2)).toThrow();
  });

  it("decrypt with wrong IV throws", () => {
    const key = generateKey();
    const { ciphertext } = encrypt("secret-value", key);
    const wrongIv = randomBytes(12).toString("base64");
    expect(() => decrypt(ciphertext, wrongIv, key)).toThrow();
  });

  it("produces different ciphertexts for same plaintext (random IV)", () => {
    const key = generateKey();
    const plaintext = "same-value";
    const result1 = encrypt(plaintext, key);
    const result2 = encrypt(plaintext, key);
    expect(result1.ciphertext).not.toBe(result2.ciphertext);
    expect(result1.iv).not.toBe(result2.iv);
  });
});

describe("deriveProjectKey", () => {
  it("produces different keys for different project IDs", () => {
    const masterKey = generateKey();
    const key1 = deriveProjectKey(masterKey, "proj_01HXYZ1234");
    const key2 = deriveProjectKey(masterKey, "proj_01HXYZ5678");
    expect(key1.equals(key2)).toBe(false);
  });

  it("is deterministic (same inputs = same output)", () => {
    const masterKey = generateKey();
    const projectId = "proj_01HXYZ1234";
    const key1 = deriveProjectKey(masterKey, projectId);
    const key2 = deriveProjectKey(masterKey, projectId);
    expect(key1.equals(key2)).toBe(true);
  });

  it("produces a 32-byte key", () => {
    const masterKey = generateKey();
    const derived = deriveProjectKey(masterKey, "proj_test");
    expect(derived.length).toBe(32);
  });
});

describe("parseEncryptionKey", () => {
  it("accepts valid 64-char hex string", () => {
    const hex = "a".repeat(64);
    const key = parseEncryptionKey(hex);
    expect(key.length).toBe(32);
    expect(key).toBeInstanceOf(Buffer);
  });

  it("accepts mixed-case hex string", () => {
    const hex = "aAbBcCdDeEfF0011223344556677889900112233445566778899aAbBcCdDeEfF";
    const key = parseEncryptionKey(hex);
    expect(key.length).toBe(32);
  });

  it("rejects hex string that is too short", () => {
    expect(() => parseEncryptionKey("abcdef")).toThrow(
      "Encryption key must be 64 hex characters (32 bytes)",
    );
  });

  it("rejects hex string that is too long", () => {
    expect(() => parseEncryptionKey("a".repeat(66))).toThrow(
      "Encryption key must be 64 hex characters (32 bytes)",
    );
  });

  it("rejects non-hex characters", () => {
    const invalid = "g".repeat(64);
    expect(() => parseEncryptionKey(invalid)).toThrow(
      "Encryption key must be 64 hex characters (32 bytes)",
    );
  });

  it("rejects empty string", () => {
    expect(() => parseEncryptionKey("")).toThrow(
      "Encryption key must be 64 hex characters (32 bytes)",
    );
  });
});
