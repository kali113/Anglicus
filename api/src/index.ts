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
import { handleChatCompletions, handleListModels } from "./routes/chat.js";
import { handleFeedback } from "./routes/feedback.js";
import {
  handleBillingConfig,
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

// Create Hono app
const app = new Hono<{ Bindings: Env }>();

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
  const headers = Object.fromEntries(response.headers.entries());
  return c.newResponse(
    response.body,
    response.status as 200 | 400 | 429 | 500,
    headers,
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
  const headers = Object.fromEntries(response.headers.entries());
  return c.newResponse(
    response.body,
    response.status as 200 | 400 | 500,
    headers,
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
