import { randomBytes, createCipheriv, createDecipheriv, hkdfSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function encrypt(plaintext: string, key: Buffer): { ciphertext: string; iv: string } {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Concatenate encrypted data + auth tag, then base64 encode
  const combined = Buffer.concat([encrypted, authTag]);
  return {
    ciphertext: combined.toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function decrypt(ciphertext: string, iv: string, key: Buffer): string {
  const combined = Buffer.from(ciphertext, "base64");
  const ivBuffer = Buffer.from(iv, "base64");
  // Split: encrypted data is everything except last 16 bytes (auth tag)
  const encrypted = combined.subarray(0, combined.length - AUTH_TAG_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, ivBuffer);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

export function deriveProjectKey(masterKey: Buffer, projectId: string): Buffer {
  return Buffer.from(hkdfSync("sha256", masterKey, "", projectId, 32));
}

export function parseEncryptionKey(hexKey: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
    throw new Error("Encryption key must be 64 hex characters (32 bytes)");
  }
  return Buffer.from(hexKey, "hex");
}
