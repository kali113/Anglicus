/**
 * Unified AI Client with 3-tier API routing
 * Tier 1: Backend router (owner's keys)
 * Tier 2: BYOK (user's own key)
 * Tier 3: Puter.js (free fallback)
 */

import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ApiError,
} from "$lib/types/api.js";
import { getSettings, getApiKey } from "$lib/storage/index.js";

// Default model to use
const DEFAULT_MODEL = "llama-3.1-8b"; // Cerebras (fast), will fallback to others if needed

// Backend URL (owner's Cloudflare Worker)
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8787";

export interface AiClientConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  provider?: "backend" | "byok" | "puter";
}

/**
 * Try Tier 1: Backend router with owner's keys
 */
async function tryBackend(request: ChatCompletionRequest): Promise<AiResponse> {
  const response = await fetch(`${BACKEND_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new Error(error.error?.message || "Backend request failed");
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices[0]?.message?.content || "";

  return {
    content,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
    provider: "backend",
  };
}

/**
 * Try Tier 2: User's own API key (BYOK)
 */
async function tryByok(request: ChatCompletionRequest): Promise<AiResponse> {
  const settings = getSettings();
  const apiKey = await getApiKey();

  if (!apiKey || !settings.apiConfig.customBaseUrl) {
    throw new Error("BYOK not configured");
  }

  const baseUrl = settings.apiConfig.customBaseUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new Error(error.error?.message || "BYOK request failed");
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices[0]?.message?.content || "";

  return {
    content,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
    provider: "byok",
  };
}

/**
 * Try Tier 3: Puter.js (free fallback)
 * Note: This is a simplified implementation
 * In production, you'd use the Puter.js SDK
 */
async function tryPuter(
  messages: ChatCompletionRequest["messages"],
): Promise<AiResponse> {
  // Puter.js AI API (free tier)
  const response = await fetch("https://api.puterjs.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_PUTER_TOKEN || ""}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    throw new Error("Puter.js request failed");
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices[0]?.message?.content || "";

  return {
    content,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
    provider: "puter",
  };
}

/**
 * Main AI client function with automatic tier fallback
 */
export async function getCompletion(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  config: AiClientConfig = {},
): Promise<AiResponse> {
  const settings = getSettings();
  const request: ChatCompletionRequest = {
    model: config.model || DEFAULT_MODEL,
    messages,
    temperature: config.temperature ?? 0.7,
    max_tokens: config.maxTokens || 500,
  };

  // Tier routing based on settings
  let lastError: Error | null = null;

  // Try configured tier first
  switch (settings.apiConfig.tier) {
    case "backend":
      try {
        return await tryBackend(request);
      } catch (e) {
        lastError = e as Error;
      }
      break;

    case "byok":
      try {
        return await tryByok(request);
      } catch (e) {
        lastError = e as Error;
      }
      break;

    case "puter":
      try {
        return await tryPuter(messages);
      } catch (e) {
        lastError = e as Error;
      }
      break;

    case "auto":
    default:
      // Auto: Try backend -> BYOK -> Puter
      try {
        return await tryBackend(request);
      } catch (e) {
        lastError = e as Error;
      }

      try {
        return await tryByok(request);
      } catch (e) {
        lastError = e as Error;
      }

      try {
        return await tryPuter(messages);
      } catch (e) {
        lastError = e as Error;
      }
      break;
  }

  throw new Error(
    `All API tiers failed. Last error: ${lastError?.message || "Unknown"}`,
  );
}

/**
 * Test connection to a specific tier
 */
export async function testConnection(
  tier: "backend" | "byok" | "puter",
): Promise<boolean> {
  try {
    // Use different models based on tier capabilities
    let testModel: string;
    
    switch (tier) {
      case "backend":
        // Backend supports all models, use a fast free one
        testModel = "llama-3.1-8b"; // Will be routed to appropriate provider
        break;
      case "byok":
        // BYOK uses user's own key, try a common model
        testModel = "gpt-3.5-turbo"; // Most common model across providers
        break;
      case "puter":
        // Puter.js uses its own models
        testModel = "gpt-3.5-turbo"; // Standard OpenAI-compatible model
        break;
      default:
        testModel = "gpt-3.5-turbo";
    }

    const testRequest: ChatCompletionRequest = {
      model: testModel,
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 5,
    };

    let result: AiResponse;

    // Test the specific tier
    switch (tier) {
      case "backend":
        result = await tryBackend(testRequest);
        break;
      case "byok":
        result = await tryByok(testRequest);
        break;
      case "puter":
        result = await tryPuter(testRequest.messages);
        break;
      default:
        return false;
    }

    return result.content.length > 0;
  } catch (error) {
    console.error(`Connection test failed for ${tier}:`, error);
    return false;
  }
}
