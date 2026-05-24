import { Resend } from "resend";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  reason?: string;
}

let cachedClient: Resend | null = null;
let cachedKey: string | null = null;

function getClient(): Resend | null {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return null;
  if (cachedClient && cachedKey === apiKey) return cachedClient;
  cachedClient = new Resend(apiKey);
  cachedKey = apiKey;
  return cachedClient;
}

/**
 * Send a transactional email via Resend.
 *
 * Fail-soft: when RESEND_API_KEY is unset (dev / CI), this logs a warning and
 * returns { ok: false, reason: "no_api_key" } instead of throwing — auth
 * endpoints continue to mint tokens, the email just isn't delivered. Test
 * harnesses can stub `process.env.RESEND_API_KEY` to assert behavior either way.
 */
export async function sendEmail(
  params: SendEmailParams,
): Promise<SendEmailResult> {
  const client = getClient();
  if (!client) {
    // eslint-disable-next-line no-console
    console.warn(
      "[email] RESEND_API_KEY not set — skipping send to %s (%s)",
      params.to,
      params.subject,
    );
    return { ok: false, reason: "no_api_key" };
  }

  const from =
    params.from ??
    process.env["RESEND_FROM"] ??
    "DeployX <no-reply@deployx.local>";

  try {
    const result = await client.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    if (result.error) {
      // eslint-disable-next-line no-console
      console.warn("[email] resend rejected send", result.error);
      return { ok: false, reason: result.error.message };
    }
    return { ok: true, id: result.data?.id };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[email] send threw", err);
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "unknown",
    };
  }
}

/**
 * Build the absolute URL the user clicks to act on a token. PLATFORM_DOMAIN
 * is required in production; in dev/test we fall back to localhost so the
 * link is still well-formed and testable.
 */
export function buildActionUrl(path: string): string {
  const domain = process.env["PLATFORM_DOMAIN"];
  if (!domain) return `http://localhost:3000${path}`;
  const scheme =
    domain === "localhost" || domain.startsWith("127.") ? "http" : "https";
  return `${scheme}://${domain}${path}`;
}

export function passwordResetTemplate(name: string, url: string): {
  subject: string;
  html: string;
} {
  return {
    subject: "Reset your DeployX password",
    html: `<p>Hi ${escapeHtml(name)},</p>
<p>You requested a password reset. Click the link below to choose a new password. This link expires in 1 hour.</p>
<p><a href="${url}">${url}</a></p>
<p>If you didn't request this, you can safely ignore this email.</p>`,
  };
}

export function emailVerificationTemplate(name: string, url: string): {
  subject: string;
  html: string;
} {
  return {
    subject: "Verify your DeployX email",
    html: `<p>Hi ${escapeHtml(name)},</p>
<p>Confirm your email address by clicking the link below:</p>
<p><a href="${url}">${url}</a></p>
<p>If you didn't sign up for DeployX, you can ignore this email.</p>`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Test-only: clear the cached Resend client so env mutations take effect. */
export function _resetEmailClientCache(): void {
  cachedClient = null;
  cachedKey = null;
}
