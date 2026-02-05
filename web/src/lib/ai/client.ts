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

// Default base URL for BYOK when none is specified (OpenAI-compatible)
const DEFAULT_BYOK_BASE_URL = "https://api.openai.com";

/**
 * Try Tier 2: User's own API key (BYOK)
 */
async function tryByok(request: ChatCompletionRequest): Promise<AiResponse> {
  const settings = getSettings();
  const apiKey = await getApiKey();

  if (!apiKey) {
    throw new Error("BYOK no configurado: falta la API key");
  }

  // Use custom base URL if set, otherwise default to OpenAI
  const baseUrl = (settings.apiConfig.customBaseUrl || DEFAULT_BYOK_BASE_URL).replace(/\/$/, "");
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

export interface ConnectionTestResult {
  success: boolean;
  error?: string;
}

/**
 * Test connection to a specific tier
 */
export async function testConnection(
  tier: "backend" | "byok" | "puter",
): Promise<ConnectionTestResult> {
  const settings = getSettings();
  
  // Pre-flight checks based on tier
  if (tier === "byok") {
    const apiKey = await getApiKey();
    if (!apiKey) {
      return { success: false, error: "No API key configurada. Guarda tu API key primero." };
    }
    // Note: customBaseUrl is optional - we default to OpenAI if not set
  }

  try {
    // Create a minimal test request
    const request: ChatCompletionRequest = {
      model: DEFAULT_MODEL,
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 10,
    };

    let result: AiResponse;
    
    // Test specific tier
    switch (tier) {
      case "backend":
        result = await tryBackend(request);
        break;
      case "byok":
        result = await tryByok(request);
        break;
      case "puter":
        result = await tryPuter(request.messages);
        break;
      default:
        return { success: false, error: "Tier no válido" };
    }

    return { success: result.content.length > 0 };
  } catch (e) {
    const error = e as Error;
    const errorMessage = parseErrorMessage(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Parse error message to provide user-friendly feedback
 */
function parseErrorMessage(error: Error): string {
  const message = error.message.toLowerCase();
  
  // Network errors
  if (message.includes("failed to fetch") || message.includes("networkerror")) {
    return "Error de red - verifica tu conexión";
  }
  
  // CORS errors
  if (message.includes("cors") || message.includes("cross-origin")) {
    return "Error CORS - el servidor no permite esta conexión";
  }
  
  // Authentication errors
  if (message.includes("401") || message.includes("unauthorized") || message.includes("invalid api key")) {
    return "API key inválida o expirada";
  }
  
  // Rate limiting
  if (message.includes("429") || message.includes("rate limit") || message.includes("too many requests")) {
    return "Límite de peticiones excedido";
  }
  
  // Server errors
  if (message.includes("500") || message.includes("502") || message.includes("503") || message.includes("504")) {
    return "Error del servidor - intenta más tarde";
  }
  
  // Timeout
  if (message.includes("timeout") || message.includes("timed out")) {
    return "Tiempo de espera agotado";
  }
  
  // Configuration errors
  if (message.includes("byok no configurado") || message.includes("falta la api key")) {
    return "Falta configurar la API key";
  }
  
  // Return original message if no pattern matched (truncated if too long)
  return error.message.length > 50 ? error.message.substring(0, 47) + "..." : error.message;
}
