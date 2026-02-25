import { getToken, refreshToken, setToken } from "$lib/auth/index.js";
import { hasAnalyticsConsent } from "$lib/consent/index.js";
import { BACKEND_URL } from "$lib/config/backend-url.js";
import { isBrowser } from "$lib/storage/base-store.js";

const PRODUCT_DEDUPE_KEY = "anglicus_event_dedupe_v1";
const WEB_DEDUPE_KEY = "anglicus_web_event_dedupe_v1";
const VISITOR_ID_KEY = "anglicus_visitor_id_v1";
const SESSION_ID_KEY = "anglicus_session_id_v1";
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
  | "payment_session_created"
  | "payment_detected"
  | "payment_underpaid"
  | "payment_expired"
  | "reminder_enabled"
  | "referral_applied"
  | "reactivation_nudge_shown";

export type WebAnalyticsEvent =
  | "page_view"
  | "consent_accepted"
  | "cta_clicked"
  | "funnel_step"
  | "feature_engaged"
  | "pricing_interaction"
  | (string & {});

type TrackWebEventInput = {
  metadata?: Record<string, unknown>;
  pagePath?: string;
  pageTitle?: string;
  referrerHost?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
};

export async function trackEvent(
  event: AnalyticsEvent,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  if (!isBrowser()) return;
  if (!hasAnalyticsConsent()) return;

  const dedupeToken = `${event}:${JSON.stringify(metadata)}`;
  if (!reserveDedupeToken(PRODUCT_DEDUPE_KEY, dedupeToken)) return;

  if (getToken()) {
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

  await trackWebEvent(event, { metadata }).catch((error) => {
    console.warn("Web fallback event tracking failed:", error);
  });
}

export async function trackPageView(pathOverride?: string): Promise<void> {
  if (!isBrowser()) return;

  const currentUrl = new URL(window.location.href);
  const referrerHost = extractHost(document.referrer);

  await trackWebEvent("page_view", {
    pagePath: pathOverride ?? `${currentUrl.pathname}${currentUrl.search}`,
    pageTitle: document.title || "Untitled",
    referrerHost,
    utmSource: currentUrl.searchParams.get("utm_source") || undefined,
    utmMedium: currentUrl.searchParams.get("utm_medium") || undefined,
    utmCampaign: currentUrl.searchParams.get("utm_campaign") || undefined,
    utmTerm: currentUrl.searchParams.get("utm_term") || undefined,
    utmContent: currentUrl.searchParams.get("utm_content") || undefined,
  });
}

export async function trackWebEvent(
  event: WebAnalyticsEvent,
  input: TrackWebEventInput = {},
): Promise<void> {
  if (!isBrowser()) return;
  if (!hasAnalyticsConsent()) return;

  const normalizedPath = normalizeOptionalText(
    input.pagePath || `${window.location.pathname}${window.location.search}`,
  );

  const dedupeToken = `${event}:${normalizedPath || "-"}:${JSON.stringify(
    input.metadata || {},
  )}`;
  if (!reserveDedupeToken(WEB_DEDUPE_KEY, dedupeToken)) return;

  const currentUrl = new URL(window.location.href);
  const idempotencyKey = `${event}:${Date.now()}:${crypto.randomUUID()}`;
  const payload = {
    event,
    idempotencyKey,
    visitorId: getOrCreateVisitorId(),
    sessionId: getOrCreateSessionId(),
    pagePath: normalizedPath,
    pageTitle: normalizeOptionalText(input.pageTitle || document.title),
    referrerHost: normalizeOptionalText(input.referrerHost || extractHost(document.referrer)),
    utmSource: normalizeOptionalText(
      input.utmSource || currentUrl.searchParams.get("utm_source"),
    ),
    utmMedium: normalizeOptionalText(
      input.utmMedium || currentUrl.searchParams.get("utm_medium"),
    ),
    utmCampaign: normalizeOptionalText(
      input.utmCampaign || currentUrl.searchParams.get("utm_campaign"),
    ),
    utmTerm: normalizeOptionalText(
      input.utmTerm || currentUrl.searchParams.get("utm_term"),
    ),
    utmContent: normalizeOptionalText(
      input.utmContent || currentUrl.searchParams.get("utm_content"),
    ),
    locale: normalizeOptionalText(document.documentElement.lang || navigator.language),
    metadata: input.metadata || {},
  };

  await fetchWithOptionalAuthRetry(`${BACKEND_URL}/api/analytics/web-event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((error) => {
    console.warn("Web event tracking failed:", error);
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

async function fetchWithOptionalAuthRetry(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const token = getToken();
  if (!token) {
    return fetch(url, init);
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

  try {
    const refreshed = await refreshToken();
    setToken(refreshed);
    const retryHeaders = new Headers(init.headers);
    retryHeaders.set("Authorization", `Bearer ${refreshed}`);
    return fetch(url, {
      ...init,
      headers: retryHeaders,
    });
  } catch {
    return firstResponse;
  }
}

function reserveDedupeToken(cacheKey: string, token: string): boolean {
  const now = Date.now();
  const cache = readDedupeCache(cacheKey);
  const lastSeen = cache[token];
  if (typeof lastSeen === "number" && now - lastSeen < DEDUPE_WINDOW_MS) {
    return false;
  }

  cache[token] = now;
  const entries = Object.entries(cache)
    .filter(([, value]) => now - value < 60_000)
    .sort((a, b) => b[1] - a[1])
    .slice(0, DEDUPE_MAX_ENTRIES);

  try {
    localStorage.setItem(cacheKey, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Ignore storage failures and keep runtime execution moving.
  }
  return true;
}

function readDedupeCache(cacheKey: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getOrCreateVisitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_ID_KEY);
    if (existing && existing.length >= 10) {
      return existing;
    }

    const generated = crypto.randomUUID();
    localStorage.setItem(VISITOR_ID_KEY, generated);
    return generated;
  } catch {
    return `fallback-${Date.now()}`;
  }
}

function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_ID_KEY);
    if (existing && existing.length >= 10) {
      return existing;
    }

    const generated = crypto.randomUUID();
    sessionStorage.setItem(SESSION_ID_KEY, generated);
    return generated;
  } catch {
    return `session-${Date.now()}`;
  }
}

function extractHost(urlLike: string): string | undefined {
  if (!urlLike) return undefined;
  try {
    const parsed = new URL(urlLike);
    return parsed.host;
  } catch {
    return undefined;
  }
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized.slice(0, 300) : undefined;
}
