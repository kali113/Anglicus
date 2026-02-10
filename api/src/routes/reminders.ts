/**
 * Reminder endpoints and scheduled sender
 */

import type { Env } from "../index.js";
import { jsonError, jsonSuccess } from "../lib/response.js";

type ReminderFrequency = "daily" | "weekly";
type ReminderLanguage = "en" | "es";

interface ReminderSubscription {
  email: string;
  reminderTime: string;
  timezoneOffsetMinutes: number;
  frequency: ReminderFrequency;
  language: ReminderLanguage;
  reminderWeekday?: number;
  createdAt: string;
  updatedAt: string;
  lastSentAt?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_OFFSET_MINUTES = 840;
const REMINDER_PREFIX = "reminder:";
const SEND_WINDOW_MINUTES = 15;

function requireReminderConfig(env: Env): string | null {
  if (!env.REMINDER_KV) return "Reminder storage not configured";
  if (!env.REMINDER_ENCRYPTION_KEY) return "Reminder encryption key missing";
  if (!env.RESEND_API_KEY) return "Email service not configured";
  return null;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hashEmail(email: string, secret: string): Promise<string> {
  const input = `${email}|${secret}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return toHex(digest);
}

async function getEncryptionKey(env: Env): Promise<CryptoKey> {
  const secret = env.REMINDER_ENCRYPTION_KEY || "";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptSubscription(
  env: Env,
  subscription: ReminderSubscription,
): Promise<string> {
  const key = await getEncryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(subscription));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return JSON.stringify(Array.from(combined));
}

async function decryptSubscription(
  env: Env,
  encryptedData: string,
): Promise<ReminderSubscription | null> {
  const key = await getEncryptionKey(env);
  const combined = Uint8Array.from(JSON.parse(encryptedData) as number[]);
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encrypted,
  );
  const decoded = new TextDecoder().decode(decrypted);
  return JSON.parse(decoded) as ReminderSubscription;
}

function getLocalDate(now: Date, offsetMinutes: number): Date {
  return new Date(now.getTime() - offsetMinutes * 60 * 1000);
}

function isReminderDue(subscription: ReminderSubscription, now: Date): boolean {
  const localNow = getLocalDate(now, subscription.timezoneOffsetMinutes);
  const [hours, minutes] = subscription.reminderTime.split(":").map(Number);
  const targetMinutes = hours * 60 + minutes;
  const currentMinutes = localNow.getHours() * 60 + localNow.getMinutes();

  if (
    currentMinutes < targetMinutes ||
    currentMinutes >= targetMinutes + SEND_WINDOW_MINUTES
  ) {
    return false;
  }

  if (
    subscription.frequency === "weekly" &&
    subscription.reminderWeekday !== undefined &&
    subscription.reminderWeekday !== localNow.getDay()
  ) {
    return false;
  }

  if (subscription.lastSentAt) {
    const lastSentLocal = getLocalDate(
      new Date(subscription.lastSentAt),
      subscription.timezoneOffsetMinutes,
    );
    if (lastSentLocal.toDateString() === localNow.toDateString()) {
      return false;
    }
  }

  return true;
}

function buildReminderEmail(
  subscription: ReminderSubscription,
  isTest: boolean,
): { subject: string; html: string } {
  const scheduleLabel =
    subscription.frequency === "weekly"
      ? subscription.language === "es"
        ? "Semanal"
        : "Weekly"
      : subscription.language === "es"
        ? "Diario"
        : "Daily";

  const title =
    subscription.language === "es"
      ? isTest
        ? "Prueba de recordatorio - Anglicus"
        : "Recordatorio de practica - Anglicus"
      : isTest
        ? "Reminder test - Anglicus"
        : "Practice reminder - Anglicus";

  const message =
    subscription.language === "es"
      ? "Es hora de practicar unos minutos en Anglicus."
      : "It is time to practice a few minutes in Anglicus.";

  const footer =
    subscription.language === "es"
      ? "Puedes desactivar estos recordatorios en Configuracion."
      : "You can disable these reminders in Settings.";

  return {
    subject: title,
    html: `
      <h2>${title}</h2>
      <p>${message}</p>
      <p><strong>${scheduleLabel}</strong> · ${subscription.reminderTime}</p>
      <p><a href="https://anglicus.app">Abrir Anglicus</a></p>
      <hr />
      <p style="font-size: 12px; color: #666;">${footer}</p>
    `,
  };
}

async function sendReminderEmail(
  env: Env,
  subscription: ReminderSubscription,
  isTest: boolean,
): Promise<boolean> {
  const { subject, html } = buildReminderEmail(subscription, isTest);
  const fromEmail = env.REMINDER_FROM_EMAIL || "Anglicus <reminders@anglicus.app>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [subscription.email],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Resend API error:", errorText);
    return false;
  }

  return true;
}

export async function handleReminderSubscribe(
  request: Request,
  env: Env,
): Promise<Response> {
  const configError = requireReminderConfig(env);
  if (configError) return jsonError(configError, "server_error", 503);

  try {
    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.includes("application/json")) {
      return jsonError(
        "Content-Type must be application/json",
        "invalid_request_error",
        415,
      );
    }

    const body = (await request.json()) as Partial<ReminderSubscription>;
    if (!body.email || typeof body.email !== "string") {
      return jsonError("Email is required", "invalid_request_error", 400);
    }

    const email = body.email.trim().toLowerCase();
    if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) {
      return jsonError("Email is invalid", "invalid_request_error", 400);
    }
    if (!EMAIL_REGEX.test(email)) {
      return jsonError("Email is invalid", "invalid_request_error", 400);
    }

    const reminderTime = body.reminderTime?.trim();
    if (!reminderTime || !TIME_REGEX.test(reminderTime)) {
      return jsonError("Reminder time is invalid", "invalid_request_error", 400);
    }

    const timezoneOffsetMinutes = body.timezoneOffsetMinutes;
    if (typeof timezoneOffsetMinutes !== "number") {
      return jsonError(
        "Timezone offset is invalid",
        "invalid_request_error",
        400,
      );
    }
    if (
      timezoneOffsetMinutes > MAX_OFFSET_MINUTES ||
      timezoneOffsetMinutes < -MAX_OFFSET_MINUTES
    ) {
      return jsonError(
        "Timezone offset is invalid",
        "invalid_request_error",
        400,
      );
    }

    const frequency: ReminderFrequency =
      body.frequency === "weekly" ? "weekly" : "daily";
    const language: ReminderLanguage = body.language === "en" ? "en" : "es";

    const reminderKey = `${REMINDER_PREFIX}${await hashEmail(
      email,
      env.REMINDER_ENCRYPTION_KEY || "",
    )}`;

    let existing: ReminderSubscription | null = null;
    const existingEncrypted = await env.REMINDER_KV.get(reminderKey);
    if (existingEncrypted) {
      try {
        existing = await decryptSubscription(env, existingEncrypted);
      } catch (error) {
        console.error("Reminder decrypt error:", error);
      }
    }

    const now = new Date();
    const localNow = getLocalDate(now, timezoneOffsetMinutes);

    const subscription: ReminderSubscription = {
      email,
      reminderTime,
      timezoneOffsetMinutes,
      frequency,
      language,
      reminderWeekday: frequency === "weekly" ? localNow.getDay() : undefined,
      createdAt: existing?.createdAt || now.toISOString(),
      updatedAt: now.toISOString(),
      lastSentAt: existing?.lastSentAt,
    };

    const encrypted = await encryptSubscription(env, subscription);
    await env.REMINDER_KV.put(reminderKey, encrypted);

    return jsonSuccess({ success: true });
  } catch (error) {
    console.error("Reminder subscribe error:", error);
    return jsonError("Internal server error", "server_error", 500);
  }
}

export async function handleReminderUnsubscribe(
  request: Request,
  env: Env,
): Promise<Response> {
  const configError = requireReminderConfig(env);
  if (configError) return jsonError(configError, "server_error", 503);

  try {
    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.includes("application/json")) {
      return jsonError(
        "Content-Type must be application/json",
        "invalid_request_error",
        415,
      );
    }

    const body = (await request.json()) as { email?: string };
    if (!body.email || typeof body.email !== "string") {
      return jsonError("Email is required", "invalid_request_error", 400);
    }

    const email = body.email.trim().toLowerCase();
    if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) {
      return jsonError("Email is invalid", "invalid_request_error", 400);
    }
    if (!EMAIL_REGEX.test(email)) {
      return jsonError("Email is invalid", "invalid_request_error", 400);
    }

    const reminderKey = `${REMINDER_PREFIX}${await hashEmail(
      email,
      env.REMINDER_ENCRYPTION_KEY || "",
    )}`;
    await env.REMINDER_KV.delete(reminderKey);

    return jsonSuccess({ success: true });
  } catch (error) {
    console.error("Reminder unsubscribe error:", error);
    return jsonError("Internal server error", "server_error", 500);
  }
}

export async function handleReminderTest(
  request: Request,
  env: Env,
): Promise<Response> {
  const configError = requireReminderConfig(env);
  if (configError) return jsonError(configError, "server_error", 503);

  try {
    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.includes("application/json")) {
      return jsonError(
        "Content-Type must be application/json",
        "invalid_request_error",
        415,
      );
    }

    const body = (await request.json()) as {
      email?: string;
      language?: ReminderLanguage;
    };
    if (!body.email || typeof body.email !== "string") {
      return jsonError("Email is required", "invalid_request_error", 400);
    }

    const email = body.email.trim().toLowerCase();
    if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) {
      return jsonError("Email is invalid", "invalid_request_error", 400);
    }
    if (!EMAIL_REGEX.test(email)) {
      return jsonError("Email is invalid", "invalid_request_error", 400);
    }

    const language: ReminderLanguage = body.language === "en" ? "en" : "es";
    const subscription: ReminderSubscription = {
      email,
      reminderTime: "20:00",
      timezoneOffsetMinutes: 0,
      frequency: "daily",
      language,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const sent = await sendReminderEmail(env, subscription, true);
    if (!sent) {
      return jsonError("Failed to send reminder", "server_error", 502);
    }

    return jsonSuccess({ success: true });
  } catch (error) {
    console.error("Reminder test error:", error);
    return jsonError("Internal server error", "server_error", 500);
  }
}

export async function handleReminderCron(
  scheduledTime: Date,
  env: Env,
): Promise<void> {
  if (!env.REMINDER_KV || !env.REMINDER_ENCRYPTION_KEY || !env.RESEND_API_KEY) {
    return;
  }

  let cursor: string | undefined = undefined;
  const now = scheduledTime || new Date();

  do {
    const list = await env.REMINDER_KV.list({
      prefix: REMINDER_PREFIX,
      cursor,
    });

    for (const key of list.keys) {
      try {
        const encrypted = await env.REMINDER_KV.get(key.name);
        if (!encrypted) continue;
        const subscription = await decryptSubscription(env, encrypted);
        if (!subscription) continue;

        if (!isReminderDue(subscription, now)) continue;

        const sent = await sendReminderEmail(env, subscription, false);
        if (!sent) continue;

        const updated = {
          ...subscription,
          updatedAt: now.toISOString(),
          lastSentAt: now.toISOString(),
        };
        const updatedEncrypted = await encryptSubscription(env, updated);
        await env.REMINDER_KV.put(key.name, updatedEncrypted);
      } catch (error) {
        console.error("Reminder cron error:", error);
      }
    }

    cursor = list.cursor;
  } while (cursor);
}
