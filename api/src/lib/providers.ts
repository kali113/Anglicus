/**
 * AI Provider Configurations
 * Centralized provider definitions for the multi-provider chat routing system
 */

import type { Env } from "../index.js";

/**
 * Provider configuration interface
 */
export interface ProviderConfig {
  /** Base URL for the provider's chat completions endpoint */
  url: string;
  /** Environment variable name for the API key */
  key: keyof Env;
  /** HTTP header name for authentication */
  header: string;
  /** Prefix for the header value (e.g., "Bearer ") */
  headerPrefix: string;
}

/**
 * All supported AI providers with their configurations
 */
export const PROVIDERS: Record<string, ProviderConfig> = {
  openrouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    key: "OPENROUTER_API_KEY",
    header: "Authorization",
    headerPrefix: "Bearer ",
  },
  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: "GROQ_API_KEY",
    header: "Authorization",
    headerPrefix: "Bearer ",
  },
  together: {
    url: "https://api.together.xyz/v1/chat/completions",
    key: "TOGETHER_API_KEY",
    header: "Authorization",
    headerPrefix: "Bearer ",
  },
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/chat/completions",
    key: "GEMINI_API_KEY",
    header: "x-goog-api-key",
    headerPrefix: "",
  },
  mistral: {
    url: "https://api.mistral.ai/v1/chat/completions",
    key: "MISTRAL_API_KEY",
    header: "Authorization",
    headerPrefix: "Bearer ",
  },
  cohere: {
    url: "https://api.cohere.ai/v1/chat",
    key: "COHERE_API_KEY",
    header: "Authorization",
    headerPrefix: "Bearer ",
  },
  nvidia: {
    url: "https://integrate.api.nvidia.com/v1/chat/completions",
    key: "NVIDIA_API_KEY",
    header: "Authorization",
    headerPrefix: "Bearer ",
  },
  huggingface: {
    url: "https://router.huggingface.co/v1/chat/completions",
    key: "HUGGINGFACE_API_KEY",
    header: "Authorization",
    headerPrefix: "Bearer ",
  },
  cloudflare: {
    url: "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/",
    key: "CLOUDFLARE_API_KEY",
    header: "Authorization",
    headerPrefix: "Bearer ",
  },
  ollama: {
    url: "http://localhost:11434/v1/chat/completions",
    key: "OLLAMA_API_KEY",
    header: "Authorization",
    headerPrefix: "Bearer ",
  },
  opencode: {
    url: "https://opencode.dev/api/v1/chat/completions",
    key: "OPENCODE_API_KEY",
    header: "Authorization",
    headerPrefix: "Bearer ",
  },
  cerebras: {
    url: "https://api.cerebras.ai/v1/chat/completions",
    key: "CEREBRAS_API_KEY",
    header: "Authorization",
    headerPrefix: "Bearer ",
  },
} as const;

export type Provider = keyof typeof PROVIDERS;

/**
 * Priority order for provider failover
 * Ordered by: free tier availability, speed, and reliability
 */
export const PROVIDER_PRIORITY: Provider[] = [
  "openrouter",   // Full model access via OpenRouter
  "cerebras",     // Very fast, free tier
  "mistral",      // Free tier available
  "huggingface",  // Free tier
  "groq",         // Fast, free tier (but may have issues)
  "nvidia",       // Free tier
  "cohere",       // Has free tier
  "gemini",       // Has free tier
  "together",
];

/**
 * Get API key for provider from environment
 */
export function getApiKey(env: Env, provider: Provider): string {
  const keyName = PROVIDERS[provider].key;
  return (env[keyName] as string) || "";
}

/**
 * Get providers that have API keys configured
 */
export function getAvailableProviders(env: Env): Provider[] {
  return PROVIDER_PRIORITY.filter((provider) => {
    const keyName = PROVIDERS[provider].key;
    return !!(env[keyName] as string);
  });
}
