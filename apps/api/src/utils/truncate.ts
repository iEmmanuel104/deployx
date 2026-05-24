// Cap an arbitrarily long string before persisting it to the DB. SQLite has
// no hard column limit but oversized error / build logs (e.g. multi-MB stack
// traces from a broken build) bloat backups and degrade dashboard rendering.
// Used by the deployment handlers to keep `deployments.errorMsg` and
// `deployments.buildLog` bounded at 64 KiB.
//
// Length is measured in UTF-8 byte length, not code units, so multi-byte
// characters cannot slip past the cap. We back the head slice off until it
// lands on a UTF-8 character boundary so we never split a multi-byte
// sequence — the output is always valid UTF-8 and the total byte length
// stays under `max`. A `\n[...truncated]` suffix lets callers see that the
// value was clipped without a separate flag.
const TRUNCATION_SUFFIX = "\n[...truncated]";
const SUFFIX_BYTES = Buffer.byteLength(TRUNCATION_SUFFIX, "utf8");

export function truncate(s: string, max: number): string {
  const buf = Buffer.from(s, "utf8");
  if (buf.length <= max) return s;

  let headEnd = Math.max(0, max - SUFFIX_BYTES);
  // Walk back to the start of any UTF-8 continuation byte (0b10xxxxxx) so we
  // never split a multi-byte character.
  while (headEnd > 0 && (buf[headEnd] & 0xc0) === 0x80) {
    headEnd--;
  }
  const head = buf.subarray(0, headEnd).toString("utf8");
  return head + TRUNCATION_SUFFIX;
}
