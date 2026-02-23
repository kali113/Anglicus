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

type TrackedEventName = (typeof TRACKED_EVENTS)[number];

type AnalyticsAuthContext = {
  db: D1Database;
  user: UserRecord;
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
    try {
      metadataJson = JSON.stringify(body.metadata);
    } catch {
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

function normalizeTrackedEvent(raw?: string): TrackedEventName | null {
  if (!raw) return null;
  const normalized = raw.trim() as TrackedEventName;
  return TRACKED_EVENTS.includes(normalized) ? normalized : null;
}

function normalizeIdempotencyKey(raw?: string): string | null {
  const key = raw?.trim() || crypto.randomUUID();
  if (key.length < 8 || key.length > 120) return null;
  return key;
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
