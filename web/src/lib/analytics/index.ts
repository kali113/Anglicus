import { getToken, refreshToken, setToken } from "$lib/auth/index.js";
import { isBrowser } from "$lib/storage/base-store.js";

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:8787";
const DEDUPE_KEY = "anglicus_event_dedupe_v1";
const DEDUPE_WINDOW_MS = 15_000;
const DEDUPE_MAX_ENTRIES = 200;

export type AnalyticsEvent =
  | "signup_started"
  | "signup_completed"
  | "onboarding_completed"
  | "activation_first_action"
  | "paywall_shown"
  | "payment_initiated"
  | "payment_confirmed"
  | "reminder_enabled"
  | "referral_applied"
  | "reactivation_nudge_shown";

export async function trackEvent(
  event: AnalyticsEvent,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  if (!isBrowser()) return;
  if (!getToken()) return;

  const dedupeToken = `${event}:${JSON.stringify(metadata)}`;
  if (!reserveDedupeToken(dedupeToken)) return;

  const idempotencyKey = `${event}:${Date.now()}:${crypto.randomUUID()}`;
  await fetchWithAuthRetry(`${BACKEND_URL}/api/analytics/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event,
      idempotencyKey,
      metadata,
    }),
  }).catch((error) => {
    console.warn("Event tracking failed:", error);
  });
}

async function fetchWithAuthRetry(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const token = getToken();
  if (!token) {
    throw new Error("No auth token");
  }

  const firstHeaders = new Headers(init.headers);
  firstHeaders.set("Authorization", `Bearer ${token}`);
  const firstResponse = await fetch(url, {
    ...init,
    headers: firstHeaders,
  });
  if (firstResponse.status !== 401) {
    return firstResponse;
  }

  const refreshed = await refreshToken();
  setToken(refreshed);

  const retryHeaders = new Headers(init.headers);
  retryHeaders.set("Authorization", `Bearer ${refreshed}`);
  return fetch(url, {
    ...init,
    headers: retryHeaders,
  });
}

function reserveDedupeToken(token: string): boolean {
  const now = Date.now();
  const cache = readDedupeCache();
  const lastSeen = cache[token];
  if (typeof lastSeen === "number" && now - lastSeen < DEDUPE_WINDOW_MS) {
    return false;
  }

  cache[token] = now;
  const entries = Object.entries(cache)
    .filter(([, value]) => now - value < 60_000)
    .sort((a, b) => b[1] - a[1])
    .slice(0, DEDUPE_MAX_ENTRIES);
  localStorage.setItem(DEDUPE_KEY, JSON.stringify(Object.fromEntries(entries)));
  return true;
}

function readDedupeCache(): Record<string, number> {
  try {
    const raw = localStorage.getItem(DEDUPE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
