import type { Env } from "../index.js";

type EmailProvider = "brevo" | "resend" | "ses";

export interface SendEmailRequest {
  from: string;
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
}

interface SendEmailResult {
  ok: boolean;
  provider: EmailProvider;
  status?: number;
  error?: string;
}

type Mailbox = {
  email: string;
  name?: string;
};

function isValidEmail(input: string): boolean {
  if (!input || input.length > 254) return false;

  const atIndex = input.indexOf("@");
  if (atIndex <= 0 || atIndex !== input.lastIndexOf("@")) return false;
  if (atIndex === input.length - 1) return false;

  const local = input.slice(0, atIndex);
  const domain = input.slice(atIndex + 1);
  if (!local || !domain) return false;
  if (local.length > 64) return false;
  if (domain.length > 253) return false;

  for (const ch of input) {
    const code = ch.charCodeAt(0);
    if (code <= 32 || code === 127) return false;
  }

  if (domain.startsWith(".") || domain.endsWith(".")) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;

  for (const label of labels) {
    if (!label) return false;
    if (label.startsWith("-") || label.endsWith("-")) return false;
    for (const ch of label) {
      const isLower = ch >= "a" && ch <= "z";
      const isUpper = ch >= "A" && ch <= "Z";
      const isDigit = ch >= "0" && ch <= "9";
      if (!isLower && !isUpper && !isDigit && ch !== "-") return false;
    }
  }

  return true;
}

function normalizeProvider(value: string | undefined): EmailProvider | null {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "brevo" || normalized === "resend" || normalized === "ses") {
    return normalized;
  }
  return null;
}

function parseMailbox(value: string): Mailbox | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const angleMatch = trimmed.match(/^([^<]*)<([^>]+)>$/);
  if (angleMatch) {
    const name = angleMatch[1]?.trim();
    const email = angleMatch[2]?.trim().toLowerCase();
    if (!email || !isValidEmail(email)) return null;
    return { email, name: name || undefined };
  }

  if (!isValidEmail(trimmed.toLowerCase())) {
    return null;
  }
  return { email: trimmed.toLowerCase() };
}

function resolveProvider(env: Env): EmailProvider {
  const explicit = normalizeProvider(env.EMAIL_PROVIDER);
  if (explicit) return explicit;
  if (env.BREVO_API_KEY) return "brevo";
  if (env.RESEND_API_KEY) return "resend";
  return "brevo";
}

export function getEmailConfigError(env: Env): string | null {
  const provider = resolveProvider(env);

  if (provider === "brevo" && !env.BREVO_API_KEY) {
    return "Email service not configured (missing BREVO_API_KEY)";
  }
  if (provider === "resend" && !env.RESEND_API_KEY) {
    return "Email service not configured (missing RESEND_API_KEY)";
  }
  if (provider === "ses") {
    return "Email service provider 'ses' is not implemented yet";
  }

  return null;
}

async function sendViaBrevo(
  env: Env,
  payload: SendEmailRequest,
): Promise<SendEmailResult> {
  if (!env.BREVO_API_KEY) {
    return {
      ok: false,
      provider: "brevo",
      error: "Missing BREVO_API_KEY",
    };
  }

  const sender = parseMailbox(payload.from);
  if (!sender) {
    return {
      ok: false,
      provider: "brevo",
      error: "Invalid sender address format",
    };
  }

  const recipients: Mailbox[] = [];
  for (const to of payload.to) {
    const mailbox = parseMailbox(to);
    if (!mailbox) {
      return {
        ok: false,
        provider: "brevo",
        error: "Invalid recipient address format",
      };
    }
    recipients.push(mailbox);
  }

  const replyTo = payload.replyTo ? parseMailbox(payload.replyTo) : null;
  if (payload.replyTo && !replyTo) {
    return {
      ok: false,
      provider: "brevo",
      error: "Invalid reply-to address format",
    };
  }

  const body: {
    sender: Mailbox;
    to: Mailbox[];
    subject: string;
    htmlContent: string;
    replyTo?: Mailbox;
  } = {
    sender,
    to: recipients,
    subject: payload.subject,
    htmlContent: payload.html,
  };

  if (replyTo) {
    body.replyTo = replyTo;
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return {
      ok: false,
      provider: "brevo",
      status: response.status,
      error: await response.text(),
    };
  }

  return { ok: true, provider: "brevo", status: response.status };
}

async function sendViaResend(
  env: Env,
  payload: SendEmailRequest,
): Promise<SendEmailResult> {
  if (!env.RESEND_API_KEY) {
    return {
      ok: false,
      provider: "resend",
      error: "Missing RESEND_API_KEY",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      reply_to: payload.replyTo,
    }),
  });

  if (!response.ok) {
    return {
      ok: false,
      provider: "resend",
      status: response.status,
      error: await response.text(),
    };
  }

  return { ok: true, provider: "resend", status: response.status };
}

async function sendViaSes(
  _env: Env,
  _payload: SendEmailRequest,
): Promise<SendEmailResult> {
  return {
    ok: false,
    provider: "ses",
    error: "SES provider support is not implemented yet",
  };
}

export async function sendEmail(
  env: Env,
  payload: SendEmailRequest,
): Promise<SendEmailResult> {
  const provider = resolveProvider(env);

  if (provider === "brevo") return sendViaBrevo(env, payload);
  if (provider === "resend") return sendViaResend(env, payload);
  return sendViaSes(env, payload);
}
