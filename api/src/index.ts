/**
 * Anglicus API Router - Cloudflare Worker
 * OpenAI-compatible API proxy with rate limiting and feedback system
 */

import { Hono } from "hono";
import { cors, parseAllowedOrigins } from "./lib/cors.js";
import {
  RateLimiter,
  applyRateLimitCheck,
} from "./lib/rate-limiter.js";
import { extractBearerToken, getCurrentDayNumber, verifyJwt } from "./lib/auth.js";
import {
  getUserById,
  getUsageCount,
  incrementUsage,
  type UserRecord,
} from "./lib/db.js";
import { FEATURE_HEADER, FREE_LIMITS, parseUsageFeature } from "./lib/usage.js";
import { handleChatCompletions, handleListModels } from "./routes/chat.js";
import {
  handleAuthByok,
  handleAuthLogin,
  handleAuthRefresh,
  handleAuthGoogle,
  handleAuthRegister,
  handleAuthVerify,
} from "./routes/auth.js";
import { handleFeedback } from "./routes/feedback.js";
import {
  handleBillingConfig,
  handleBillingPromo,
  handleBillingVerify,
} from "./routes/billing.js";
import {
  handleReminderSubscribe,
  handleReminderUnsubscribe,
  handleReminderTest,
  handleReminderCron,
} from "./routes/reminders.js";

// Type definition for Cloudflare Worker environment
export interface Env {
  DB?: D1Database;
  // AI Provider API Keys (set via wrangler secret)
  OPENROUTER_API_KEY?: string;
  GROQ_API_KEY?: string;
  TOGETHER_API_KEY?: string;
  GEMINI_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  COHERE_API_KEY?: string;
  NVIDIA_API_KEY?: string;
  HUGGINGFACE_API_KEY?: string;
  CLOUDFLARE_API_KEY?: string;
  OLLAMA_API_KEY?: string;
  OPENCODE_API_KEY?: string;
  CEREBRAS_API_KEY?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;

  // Feedback email service (set via wrangler secret)
  OWNER_EMAIL?: string;
  RESEND_API_KEY?: string;
  AUTH_FROM_EMAIL?: string;
  JWT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  EMAIL_PEPPER?: string;
  REMINDER_ENCRYPTION_KEY?: string;
  REMINDER_FROM_EMAIL?: string;
  REMINDER_KV?: KVNamespace;

  // Configuration variables
  RATE_LIMIT_PER_MINUTE?: string;
  FEEDBACK_RATE_LIMIT_PER_MINUTE?: string;
  ALLOWED_ORIGINS?: string;
  ALLOW_LOCAL_PROVIDERS?: string;

  // Billing configuration
  BTC_RECEIVING_ADDRESS?: string;
  BTC_MIN_SATS?: string;
  BTC_SUBSCRIPTION_DAYS?: string;
  BTC_NETWORK?: string;
  BTC_PRICE_USD?: string;
  PROMO_CODE_PEPPER?: string;
}

// Module-level rate limiter (persists within isolate lifecycle)
// Note: Still resets between isolate cold starts. For true persistence, use Durable Objects or KV.
let rateLimiter: RateLimiter | null = null;
let feedbackRateLimiter: RateLimiter | null = null;

function getRateLimiter(env: Env): RateLimiter {
  if (!rateLimiter) {
    const rateLimitPerMinute = parseInt(env.RATE_LIMIT_PER_MINUTE || "20", 10);
    rateLimiter = new RateLimiter({ requestsPerMinute: rateLimitPerMinute });
  }
  return rateLimiter;
}

function getFeedbackRateLimiter(env: Env): RateLimiter {
  if (!feedbackRateLimiter) {
    const rateLimitPerMinute = parseInt(
      env.FEEDBACK_RATE_LIMIT_PER_MINUTE || "5",
      10,
    );
    feedbackRateLimiter = new RateLimiter({
      requestsPerMinute: rateLimitPerMinute,
    });
  }
  return feedbackRateLimiter;
}

function getAuthConfig(env: Env): { db: D1Database; jwtSecret: string } | null {
  if (!env.DB || !env.JWT_SECRET) return null;
  return { db: env.DB, jwtSecret: env.JWT_SECRET };
}

// Create Hono app
const app = new Hono<{ Bindings: Env; Variables: { user: UserRecord } }>();

// Apply CORS middleware to all routes
app.use("*", async (c, next) => {
  const allowedOrigins = parseAllowedOrigins(c.env.ALLOWED_ORIGINS ?? "");
  const corsMiddleware = cors({ allowedOrigins });
  return corsMiddleware(c, next);
});

// Health check endpoint
app.get("/", (c) => {
  return c.json({
    status: "ok",
    service: "anglicus-api",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// Auth endpoints
app.post("/auth/register", async (c) => {
  return handleAuthRegister(c.req.raw, c.env);
});

app.post("/auth/verify", async (c) => {
  return handleAuthVerify(c.req.raw, c.env);
});

app.post("/auth/login", async (c) => {
  return handleAuthLogin(c.req.raw, c.env);
});

app.post("/auth/google", async (c) => {
  return handleAuthGoogle(c.req.raw, c.env);
});

app.post("/auth/refresh", async (c) => {
  return handleAuthRefresh(c.req.raw, c.env);
});

app.post("/auth/byok", async (c) => {
  return handleAuthByok(c.req.raw, c.env);
});

// Auth middleware for AI routes
app.use("/v1/*", async (c, next) => {
  const config = getAuthConfig(c.env);
  if (!config) {
    return c.json({ error: "Auth not configured" }, 503);
  }

  const token = extractBearerToken(c.req.raw);
  if (!token) {
    return c.json({ error: "Auth required" }, 401);
  }

  const payload = await verifyJwt(token, config.jwtSecret);
  if (!payload) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await getUserById(config.db, payload.user_id);
  if (!user) {
    return c.json({ error: "Invalid token" }, 401);
  }

  c.set("user", user);
  await next();
});

// Usage enforcement middleware for AI routes
app.use("/v1/*", async (c, next) => {
  const config = getAuthConfig(c.env);
  if (!config) {
    return c.json({ error: "Auth not configured" }, 503);
  }

  const user = c.get("user");
  const path = new URL(c.req.url).pathname;
  if (path !== "/v1/chat/completions") {
    await next();
    return;
  }

  if (user.auth_provider === "byok") {
    await next();
    return;
  }

  const currentDay = getCurrentDayNumber();
  if (
    user.plan_type === "pro" &&
    user.plan_expires_day &&
    user.plan_expires_day > currentDay
  ) {
    await next();
    return;
  }

  const feature = parseUsageFeature(c.req.header(FEATURE_HEADER));
  if (!feature) {
    return c.json({ error: "feature_required" }, 400);
  }

  const usage = await getUsageCount(config.db, user.id, currentDay, feature);
  if (usage >= FREE_LIMITS[feature]) {
    return c.json({ error: "limit_reached", upgrade_url: "/billing" }, 429);
  }

  await next();

  if (c.res && c.res.status < 400) {
    await incrementUsage(config.db, user.id, currentDay, feature);
  }
});

// OpenAI-compatible endpoints
app.get("/v1/models", async (c) => {
  const response = await handleListModels(c.req.raw, c.env);
  const headers = Object.fromEntries(response.headers.entries());
  return c.newResponse(
    response.body,
    response.status as 200 | 400 | 500,
    headers,
  );
});

app.post("/v1/chat/completions", async (c) => {
  // Get module-level rate limiter
  const limiter = getRateLimiter(c.env);
  const { allowed, headers } = applyRateLimitCheck(limiter, c.req.raw);

  for (const [key, value] of Object.entries(headers)) {
    c.header(key, value);
  }

  // Return 429 if rate limit exceeded
  if (!allowed) {
    return c.json(
      {
        error: {
          message: "Rate limit exceeded. Please try again later.",
          type: "rate_limit_error",
        },
      },
      429,
    );
  }

  // Handle chat completions request
  const response = await handleChatCompletions(c.req.raw, c.env);
  const responseHeaders = Object.fromEntries(response.headers.entries());
  return c.newResponse(
    response.body,
    response.status as 200 | 400 | 429 | 500,
    responseHeaders,
  );
});

// Feedback endpoint
app.post("/api/feedback", async (c) => {
  const limiter = getFeedbackRateLimiter(c.env);
  const { allowed, headers } = applyRateLimitCheck(limiter, c.req.raw);
  for (const [key, value] of Object.entries(headers)) {
    c.header(key, value);
  }

  if (!allowed) {
    return c.json(
      {
        error: {
          message: "Rate limit exceeded. Please try again later.",
          type: "rate_limit_error",
        },
      },
      429,
    );
  }

  const response = await handleFeedback(c.req.raw, c.env);
  const responseHeaders = Object.fromEntries(response.headers.entries());
  return c.newResponse(
    response.body,
    response.status as 200 | 400 | 500,
    responseHeaders,
  );
});

// Billing endpoints
app.get("/api/billing/config", async (c) => {
  const response = await handleBillingConfig(c.req.raw, c.env);
  const headers = Object.fromEntries(response.headers.entries());
  return c.newResponse(
    response.body,
    response.status as 200 | 400 | 500,
    headers,
  );
});

app.post("/api/billing/promo", async (c) => {
  const response = await handleBillingPromo(c.req.raw, c.env);
  const headers = Object.fromEntries(response.headers.entries());
  return c.newResponse(
    response.body,
    response.status as 200 | 400 | 500,
    headers,
  );
});

app.post("/api/billing/verify", async (c) => {
  const response = await handleBillingVerify(c.req.raw, c.env);
  const headers = Object.fromEntries(response.headers.entries());
  return c.newResponse(
    response.body,
    response.status as 200 | 400 | 402 | 404 | 500,
    headers,
  );
});

// Reminder endpoints
app.post("/api/reminders/subscribe", async (c) => {
  const response = await handleReminderSubscribe(c.req.raw, c.env);
  const headers = Object.fromEntries(response.headers.entries());
  return c.newResponse(
    response.body,
    response.status as 200 | 400 | 415 | 503 | 500,
    headers,
  );
});

app.post("/api/reminders/unsubscribe", async (c) => {
  const response = await handleReminderUnsubscribe(c.req.raw, c.env);
  const headers = Object.fromEntries(response.headers.entries());
  return c.newResponse(
    response.body,
    response.status as 200 | 400 | 415 | 503 | 500,
    headers,
  );
});

app.post("/api/reminders/test", async (c) => {
  const response = await handleReminderTest(c.req.raw, c.env);
  const headers = Object.fromEntries(response.headers.entries());
  return c.newResponse(
    response.body,
    response.status as 200 | 400 | 415 | 502 | 503 | 500,
    headers,
  );
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// Export for Cloudflare Workers
export default {
  fetch: app.fetch,
  scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleReminderCron(new Date(event.scheduledTime), env));
  },
};
