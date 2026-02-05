/**
 * Anglicus API Router - Cloudflare Worker
 * OpenAI-compatible API proxy with rate limiting and feedback system
 */

import { Hono } from "hono";
import { cors, parseAllowedOrigins } from "./lib/cors.js";
import {
  RateLimiter,
  getClientIp,
  createRateLimitHeaders,
} from "./lib/rate-limiter.js";
import { handleChatCompletions, handleListModels } from "./routes/chat.js";
import { handleFeedback } from "./routes/feedback.js";

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

  // Configuration variables
  RATE_LIMIT_PER_MINUTE?: string;
  ALLOWED_ORIGINS?: string;
}

// Module-level rate limiter (persists within isolate lifecycle)
// Note: Still resets between isolate cold starts. For true persistence, use Durable Objects or KV.
let rateLimiter: RateLimiter | null = null;

function getRateLimiter(env: Env): RateLimiter {
  if (!rateLimiter) {
    const rateLimitPerMinute = parseInt(env.RATE_LIMIT_PER_MINUTE || "20", 10);
    rateLimiter = new RateLimiter({ requestsPerMinute: rateLimitPerMinute });
  }
  return rateLimiter;
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

  // Get client IP
  const clientIp = getClientIp(c.req.raw);

  // Check rate limit
  const rateLimitResult = limiter.check(clientIp);

  // Add rate limit headers
  const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
  for (const [key, value] of Object.entries(rateLimitHeaders)) {
    c.header(key, value);
  }

  // Return 429 if rate limit exceeded
  if (!rateLimitResult.allowed) {
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
  const response = await handleFeedback(c.req.raw, c.env);
  const headers = Object.fromEntries(response.headers.entries());
  return c.newResponse(
    response.body,
    response.status as 200 | 400 | 500,
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
export default app;
