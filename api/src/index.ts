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
  OPENAI_API_KEY?: string;
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

// Create Hono app
const app = new Hono<{ Bindings: Env }>();

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
  return c.newResponse(
    response.body,
    response.status,
    response.headers as HeadersInit,
  );
});

app.post("/v1/chat/completions", async (c) => {
  // Initialize rate limiter
  const rateLimitPerMinute = parseInt(c.env.RATE_LIMIT_PER_MINUTE || "20", 10);
  const limiter = new RateLimiter({ requestsPerMinute: rateLimitPerMinute });

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
  return c.newResponse(
    response.body,
    response.status,
    response.headers as HeadersInit,
  );
});

// Feedback endpoint
app.post("/api/feedback", async (c) => {
  const response = await handleFeedback(c.req.raw, c.env);
  return c.newResponse(
    response.body,
    response.status,
    response.headers as HeadersInit,
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
