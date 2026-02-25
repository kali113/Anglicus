import type { Env } from "../index.js";
import { extractBearerToken, verifyJwt } from "../lib/auth.js";
import { getUserById, type UserRecord } from "../lib/db.js";
import { jsonError, jsonSuccess } from "../lib/response.js";

const TRACKED_EVENTS = [
  "signup_started",
  "signup_completed",
  "onboarding_completed",
  "activation_first_action",
  "paywall_shown",
  "payment_initiated",
  "payment_confirmed",
  "payment_session_created",
  "payment_detected",
  "payment_underpaid",
  "payment_expired",
  "reminder_enabled",
  "referral_applied",
  "reactivation_nudge_shown",
] as const;

const WEB_EVENT_REGEX = /^[a-z][a-z0-9_]{1,63}$/;
const DEFAULT_DASHBOARD_WINDOW_DAYS = 30;
const ALLOWED_DASHBOARD_WINDOWS = new Set([7, 30, 90, 180]);
const MAX_METADATA_LENGTH = 16_384;
let webAnalyticsSchemaReadyPromise: Promise<void> | null = null;

type TrackedEventName = (typeof TRACKED_EVENTS)[number];

type AnalyticsAuthContext = {
  db: D1Database;
  user: UserRecord;
};

type DashboardLabelCountRow = {
  label?: string | null;
  count?: number | string | null;
};

type DashboardTrendRow = {
  day?: string | null;
  pageViews?: number | string | null;
  signupStarted?: number | string | null;
  signupCompleted?: number | string | null;
  paymentConfirmed?: number | string | null;
};

export async function handleAnalyticsTrack(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await requireAnalyticsAuth(request, env);
  if (auth.error) {
    return auth.error;
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return jsonError(
      "Content-Type must be application/json",
      "invalid_request_error",
      415,
    );
  }

  let body: {
    event?: string;
    idempotencyKey?: string;
    metadata?: unknown;
  };
  try {
    body = (await request.json()) as {
      event?: string;
      idempotencyKey?: string;
      metadata?: unknown;
    };
  } catch {
    return jsonError("Invalid JSON body", "invalid_request_error", 400);
  }

  const event = normalizeTrackedEvent(body.event);
  if (!event) {
    return jsonError("event is invalid", "invalid_request_error", 400);
  }

  const idempotencyKey = normalizeIdempotencyKey(body.idempotencyKey);
  if (!idempotencyKey) {
    return jsonError("idempotencyKey is invalid", "invalid_request_error", 400);
  }

  let metadataJson: string | null = null;
  if (body.metadata !== undefined) {
    metadataJson = normalizeMetadataJson(body.metadata);
    if (metadataJson === null) {
      return jsonError("metadata is invalid", "invalid_request_error", 400);
    }
  }

  const inserted = await auth.context.db
    .prepare(
      "INSERT OR IGNORE INTO analytics_events (id, user_id, event_name, metadata_json) VALUES (?, ?, ?, ?)",
    )
    .bind(idempotencyKey, auth.context.user.id, event, metadataJson)
    .run();

  const deduplicated = (inserted.meta?.changes ?? 0) === 0;
  return jsonSuccess({
    success: true,
    deduplicated,
    idempotencyKey,
  });
}

export async function handleAnalyticsWebTrack(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!env.DB) {
    return jsonError("Analytics service not configured", "server_error", 503);
  }

  await ensureWebAnalyticsSchema(env.DB);

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return jsonError(
      "Content-Type must be application/json",
      "invalid_request_error",
      415,
    );
  }

  type WebEventBody = {
    event?: string;
    idempotencyKey?: string;
    metadata?: unknown;
    pagePath?: unknown;
    pageTitle?: unknown;
    referrerHost?: unknown;
    utmSource?: unknown;
    utmMedium?: unknown;
    utmCampaign?: unknown;
    utmTerm?: unknown;
    utmContent?: unknown;
    locale?: unknown;
    visitorId?: unknown;
    sessionId?: unknown;
  };

  let body: WebEventBody;
  try {
    body = (await request.json()) as WebEventBody;
  } catch {
    return jsonError("Invalid JSON body", "invalid_request_error", 400);
  }

  const event = normalizeWebEventName(body.event);
  if (!event) {
    return jsonError("event is invalid", "invalid_request_error", 400);
  }

  const idempotencyKey = normalizeIdempotencyKey(body.idempotencyKey);
  if (!idempotencyKey) {
    return jsonError("idempotencyKey is invalid", "invalid_request_error", 400);
  }

  let metadataJson: string | null = null;
  if (body.metadata !== undefined) {
    metadataJson = normalizeMetadataJson(body.metadata);
    if (metadataJson === null) {
      return jsonError("metadata is invalid", "invalid_request_error", 400);
    }
  }

  const optionalUser = await resolveOptionalAnalyticsUser(request, env);

  const inserted = await env.DB.prepare(
    "INSERT OR IGNORE INTO analytics_web_events (id, event_name, user_id, visitor_id, session_id, page_path, page_title, referrer_host, utm_source, utm_medium, utm_campaign, utm_term, utm_content, locale, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      idempotencyKey,
      event,
      optionalUser?.id ?? null,
      normalizeOptionalText(body.visitorId, 160),
      normalizeOptionalText(body.sessionId, 160),
      normalizeOptionalText(body.pagePath, 300),
      normalizeOptionalText(body.pageTitle, 300),
      normalizeOptionalText(body.referrerHost, 255),
      normalizeOptionalText(body.utmSource, 120),
      normalizeOptionalText(body.utmMedium, 120),
      normalizeOptionalText(body.utmCampaign, 160),
      normalizeOptionalText(body.utmTerm, 160),
      normalizeOptionalText(body.utmContent, 160),
      normalizeOptionalText(body.locale, 35),
      metadataJson,
    )
    .run();

  const deduplicated = (inserted.meta?.changes ?? 0) === 0;

  return jsonSuccess({
    success: true,
    deduplicated,
    idempotencyKey,
  });
}

export async function handleAnalyticsDashboard(
  request: Request,
  env: Env,
): Promise<Response> {
  const adminAuth = await requireAnalyticsAdmin(request, env);
  if (adminAuth.error) {
    return adminAuth.error;
  }

  await ensureWebAnalyticsSchema(adminAuth.context.db);

  const dashboardWindowDays = normalizeDashboardWindowDays(request);
  const windowModifier = `-${dashboardWindowDays} days`;

  const [totalsWeb, totalsProduct, trends, topPages, topReferrers, topCampaigns] =
    await Promise.all([
      adminAuth.context.db
        .prepare(
          "SELECT SUM(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS pageViews, SUM(CASE WHEN event_name = 'signup_started' THEN 1 ELSE 0 END) AS signupStarted, SUM(CASE WHEN event_name = 'paywall_shown' THEN 1 ELSE 0 END) AS paywallShown, SUM(CASE WHEN event_name = 'payment_initiated' THEN 1 ELSE 0 END) AS paymentInitiated, SUM(CASE WHEN event_name = 'payment_confirmed' THEN 1 ELSE 0 END) AS paymentConfirmed, COUNT(DISTINCT CASE WHEN visitor_id IS NOT NULL AND visitor_id != '' THEN visitor_id END) AS uniqueVisitors, COUNT(DISTINCT CASE WHEN session_id IS NOT NULL AND session_id != '' THEN session_id END) AS uniqueSessions, COUNT(DISTINCT CASE WHEN user_id IS NOT NULL AND user_id != '' THEN user_id END) AS identifiedUsers FROM analytics_web_events WHERE created_at >= datetime('now', ?)",
        )
        .bind(windowModifier)
        .first<Record<string, unknown>>(),
      adminAuth.context.db
        .prepare(
          "SELECT SUM(CASE WHEN event_name = 'signup_started' THEN 1 ELSE 0 END) AS signupStarted, SUM(CASE WHEN event_name = 'signup_completed' THEN 1 ELSE 0 END) AS signupCompleted, SUM(CASE WHEN event_name = 'onboarding_completed' THEN 1 ELSE 0 END) AS onboardingCompleted, SUM(CASE WHEN event_name = 'paywall_shown' THEN 1 ELSE 0 END) AS paywallShown, SUM(CASE WHEN event_name = 'payment_initiated' THEN 1 ELSE 0 END) AS paymentInitiated, SUM(CASE WHEN event_name = 'payment_confirmed' THEN 1 ELSE 0 END) AS paymentConfirmed, SUM(CASE WHEN event_name = 'reminder_enabled' THEN 1 ELSE 0 END) AS reminderEnabled FROM analytics_events WHERE created_at >= datetime('now', ?)",
        )
        .bind(windowModifier)
        .first<Record<string, unknown>>(),
      adminAuth.context.db
        .prepare(
          "SELECT day, SUM(pageViews) AS pageViews, SUM(signupStarted) AS signupStarted, SUM(signupCompleted) AS signupCompleted, SUM(paymentConfirmed) AS paymentConfirmed FROM ( SELECT date(created_at) AS day, SUM(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS pageViews, 0 AS signupStarted, 0 AS signupCompleted, 0 AS paymentConfirmed FROM analytics_web_events WHERE created_at >= datetime('now', ?) GROUP BY date(created_at) UNION ALL SELECT date(created_at) AS day, 0 AS pageViews, SUM(CASE WHEN event_name = 'signup_started' THEN 1 ELSE 0 END) AS signupStarted, SUM(CASE WHEN event_name = 'signup_completed' THEN 1 ELSE 0 END) AS signupCompleted, SUM(CASE WHEN event_name = 'payment_confirmed' THEN 1 ELSE 0 END) AS paymentConfirmed FROM analytics_events WHERE created_at >= datetime('now', ?) GROUP BY date(created_at) ) combined GROUP BY day ORDER BY day ASC",
        )
        .bind(windowModifier, windowModifier)
        .all<DashboardTrendRow>(),
      adminAuth.context.db
        .prepare(
          "SELECT page_path AS label, COUNT(*) AS count FROM analytics_web_events WHERE created_at >= datetime('now', ?) AND event_name = 'page_view' AND page_path IS NOT NULL AND page_path != '' GROUP BY page_path ORDER BY count DESC LIMIT 10",
        )
        .bind(windowModifier)
        .all<DashboardLabelCountRow>(),
      adminAuth.context.db
        .prepare(
          "SELECT referrer_host AS label, COUNT(*) AS count FROM analytics_web_events WHERE created_at >= datetime('now', ?) AND referrer_host IS NOT NULL AND referrer_host != '' GROUP BY referrer_host ORDER BY count DESC LIMIT 10",
        )
        .bind(windowModifier)
        .all<DashboardLabelCountRow>(),
      adminAuth.context.db
        .prepare(
          "SELECT TRIM(COALESCE(utm_source, '(direct)') || ' / ' || COALESCE(utm_campaign, '(none)')) AS label, COUNT(*) AS count FROM analytics_web_events WHERE created_at >= datetime('now', ?) AND (utm_source IS NOT NULL OR utm_campaign IS NOT NULL) GROUP BY utm_source, utm_campaign ORDER BY count DESC LIMIT 10",
        )
        .bind(windowModifier)
        .all<DashboardLabelCountRow>(),
    ]);

  const [webEventMix, productEventMix] = await Promise.all([
    adminAuth.context.db
      .prepare(
        "SELECT event_name AS label, COUNT(*) AS count FROM analytics_web_events WHERE created_at >= datetime('now', ?) GROUP BY event_name ORDER BY count DESC LIMIT 20",
      )
      .bind(windowModifier)
      .all<DashboardLabelCountRow>(),
    adminAuth.context.db
      .prepare(
        "SELECT event_name AS label, COUNT(*) AS count FROM analytics_events WHERE created_at >= datetime('now', ?) GROUP BY event_name ORDER BY count DESC LIMIT 20",
      )
      .bind(windowModifier)
      .all<DashboardLabelCountRow>(),
  ]);

  const pageViews = asCount(totalsWeb?.pageViews);
  const uniqueVisitors = asCount(totalsWeb?.uniqueVisitors);
  const uniqueSessions = asCount(totalsWeb?.uniqueSessions);
  const identifiedUsers = asCount(totalsWeb?.identifiedUsers);

  const signupStarted = Math.max(
    asCount(totalsProduct?.signupStarted),
    asCount(totalsWeb?.signupStarted),
  );
  const signupCompleted = asCount(totalsProduct?.signupCompleted);
  const onboardingCompleted = asCount(totalsProduct?.onboardingCompleted);
  const paywallShown = Math.max(
    asCount(totalsProduct?.paywallShown),
    asCount(totalsWeb?.paywallShown),
  );
  const paymentInitiated = Math.max(
    asCount(totalsProduct?.paymentInitiated),
    asCount(totalsWeb?.paymentInitiated),
  );
  const paymentConfirmed = Math.max(
    asCount(totalsProduct?.paymentConfirmed),
    asCount(totalsWeb?.paymentConfirmed),
  );
  const reminderEnabled = asCount(totalsProduct?.reminderEnabled);

  return jsonSuccess({
    success: true,
    generatedAt: new Date().toISOString(),
    windowDays: dashboardWindowDays,
    totals: {
      pageViews,
      uniqueVisitors,
      uniqueSessions,
      identifiedUsers,
      signupStarted,
      signupCompleted,
      onboardingCompleted,
      paywallShown,
      paymentInitiated,
      paymentConfirmed,
      reminderEnabled,
    },
    funnel: {
      signupCompletionRate: calculatePercentage(signupCompleted, signupStarted),
      onboardingRate: calculatePercentage(onboardingCompleted, signupCompleted),
      paywallToCheckoutRate: calculatePercentage(paymentInitiated, paywallShown),
      checkoutToPaymentRate: calculatePercentage(paymentConfirmed, paymentInitiated),
      paywallToPaymentRate: calculatePercentage(paymentConfirmed, paywallShown),
    },
    trends: (trends.results || []).map((row) => ({
      day: normalizeOptionalText(row.day, 24) ?? "",
      pageViews: asCount(row.pageViews),
      signupStarted: asCount(row.signupStarted),
      signupCompleted: asCount(row.signupCompleted),
      paymentConfirmed: asCount(row.paymentConfirmed),
    })),
    topPages: normalizeLabelCounts(topPages.results || []),
    topReferrers: normalizeLabelCounts(topReferrers.results || []),
    topCampaigns: normalizeLabelCounts(topCampaigns.results || []),
    eventMix: {
      web: normalizeLabelCounts(webEventMix.results || []),
      product: normalizeLabelCounts(productEventMix.results || []),
    },
  });
}

function normalizeTrackedEvent(raw?: string): TrackedEventName | null {
  if (!raw) return null;
  const normalized = raw.trim() as TrackedEventName;
  return TRACKED_EVENTS.includes(normalized) ? normalized : null;
}

function normalizeWebEventName(raw?: string): string | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (!WEB_EVENT_REGEX.test(normalized)) {
    return null;
  }
  return normalized;
}

function normalizeIdempotencyKey(raw?: string): string | null {
  const key = raw?.trim() || crypto.randomUUID();
  if (key.length < 8 || key.length > 120) return null;
  return key;
}

function normalizeMetadataJson(metadata: unknown): string | null {
  try {
    const json = JSON.stringify(metadata);
    if (!json || json.length > MAX_METADATA_LENGTH) {
      return null;
    }
    return json;
  } catch {
    return null;
  }
}

function normalizeOptionalText(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    return normalized.slice(0, maxLength);
  }
  return normalized;
}

async function ensureWebAnalyticsSchema(db: D1Database): Promise<void> {
  if (webAnalyticsSchemaReadyPromise) {
    return webAnalyticsSchemaReadyPromise;
  }

  webAnalyticsSchemaReadyPromise = (async () => {
    await db
      .prepare(
        "CREATE TABLE IF NOT EXISTS analytics_web_events (id TEXT PRIMARY KEY, event_name TEXT NOT NULL, user_id TEXT, visitor_id TEXT, session_id TEXT, page_path TEXT, page_title TEXT, referrer_host TEXT, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_term TEXT, utm_content TEXT, locale TEXT, metadata_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))",
      )
      .run();

    await db
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_analytics_web_events_time ON analytics_web_events (created_at)",
      )
      .run();
    await db
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_analytics_web_events_event_time ON analytics_web_events (event_name, created_at)",
      )
      .run();
    await db
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_analytics_web_events_user_time ON analytics_web_events (user_id, created_at)",
      )
      .run();
    await db
      .prepare(
        "CREATE INDEX IF NOT EXISTS idx_analytics_web_events_visitor_time ON analytics_web_events (visitor_id, created_at)",
      )
      .run();
  })().catch((error) => {
    webAnalyticsSchemaReadyPromise = null;
    throw error;
  });

  return webAnalyticsSchemaReadyPromise;
}

async function resolveOptionalAnalyticsUser(
  request: Request,
  env: Env,
): Promise<UserRecord | null> {
  if (!env.DB || !env.JWT_SECRET) {
    return null;
  }

  const token = extractBearerToken(request);
  if (!token) {
    return null;
  }

  const payload = await verifyJwt(token, env.JWT_SECRET);
  if (!payload) {
    return null;
  }

  return getUserById(env.DB, payload.user_id);
}

async function requireAnalyticsAuth(
  request: Request,
  env: Env,
): Promise<
  | { context: AnalyticsAuthContext; error?: undefined }
  | { error: Response; context?: undefined }
> {
  if (!env.DB || !env.JWT_SECRET) {
    return {
      error: jsonError("Auth service not configured", "server_error", 503),
    };
  }

  const token = extractBearerToken(request);
  if (!token) {
    return {
      error: jsonError("Auth required", "invalid_request_error", 401),
    };
  }

  const payload = await verifyJwt(token, env.JWT_SECRET);
  if (!payload) {
    return {
      error: jsonError("Invalid token", "invalid_request_error", 401),
    };
  }

  const user = await getUserById(env.DB, payload.user_id);
  if (!user) {
    return {
      error: jsonError("Invalid token", "invalid_request_error", 401),
    };
  }

  return { context: { db: env.DB, user } };
}

async function requireAnalyticsAdmin(
  request: Request,
  env: Env,
): Promise<
  | { context: AnalyticsAuthContext; error?: undefined }
  | { error: Response; context?: undefined }
> {
  const auth = await requireAnalyticsAuth(request, env);
  if (auth.error) {
    return auth;
  }

  const adminIds = (env.ANALYTICS_ADMIN_USER_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (adminIds.length === 0) {
    return {
      error: jsonError(
        "Analytics dashboard is not configured",
        "server_error",
        503,
      ),
    };
  }

  const allowAllAuthenticated = adminIds.includes("*");
  if (!allowAllAuthenticated && !adminIds.includes(auth.context.user.id)) {
    return {
      error: jsonError("Forbidden", "invalid_request_error", 403),
    };
  }

  return auth;
}

function normalizeDashboardWindowDays(request: Request): number {
  const rawValue = new URL(request.url).searchParams.get("days");
  if (!rawValue) {
    return DEFAULT_DASHBOARD_WINDOW_DAYS;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_DASHBOARD_WINDOW_DAYS;
  }

  if (!ALLOWED_DASHBOARD_WINDOWS.has(parsed)) {
    return DEFAULT_DASHBOARD_WINDOW_DAYS;
  }

  return parsed;
}

function asCount(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.round(parsed);
}

function calculatePercentage(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) {
    return 0;
  }
  return Math.round((numerator / denominator) * 10_000) / 100;
}

function normalizeLabelCounts(rows: DashboardLabelCountRow[]): {
  label: string;
  count: number;
}[] {
  return rows
    .map((row) => ({
      label: normalizeOptionalText(row.label, 300) ?? "unknown",
      count: asCount(row.count),
    }))
    .filter((row) => row.count > 0);
}
