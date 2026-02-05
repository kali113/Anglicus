/**
 * Model-to-Provider Mappings
 * Centralized model definitions and routing logic
 */

import type { Provider } from "./providers.js";

/**
 * Model to provider mapping
 * Maps model names to their respective providers
 */
export const MODEL_PROVIDERS: Record<string, Provider> = {
  // OpenRouter models (access to OpenAI, Anthropic, etc.)
  "gpt-4o": "openrouter",
  "gpt-4o-mini": "openrouter",
  "gpt-4-turbo": "openrouter",
  "gpt-4": "openrouter",
  "gpt-3.5-turbo": "openrouter",
  "claude-3-opus": "openrouter",
  "claude-3-sonnet": "openrouter",
  "claude-3-haiku": "openrouter",

  // Groq models
  "llama-3.3-70b-versatile": "groq",
  "llama-3.1-8b-instant": "groq",
  "mixtral-8x7b-32768": "groq",
  "gemma2-9b-it": "groq",
  "llama-3.3-70b-specdec": "groq",
  "llama-3.1-70b-versatile": "groq",

  // Together models
  "mistralai/Mixtral-8x7B-Instruct-v0.1": "together",
  "meta-llama/Llama-3-70b-chat-hf": "together",
  "meta-llama/Llama-3-8b-chat-hf": "together",
  "Qwen/Qwen2-72B-Instruct": "together",

  // Gemini models
  "gemini-2.0-flash-exp": "gemini",
  "gemini-1.5-pro": "gemini",
  "gemini-1.5-flash": "gemini",
  "gemini-pro": "gemini",
  "gemini-flash": "gemini",

  // Mistral models
  "mistral-large-latest": "mistral",
  "mistral-medium": "mistral",
  "mistral-small-latest": "mistral",
  "mistral-tiny": "mistral",
  "codestral-mamba-latest": "mistral",
  "mistral-nemo": "mistral",
  "pixtral-12b": "mistral",
  "open-mistral-7b": "mistral",
  "open-mixtral-8x7b": "mistral",
  "open-mixtral-8x22b": "mistral",

  // Cohere models
  "command-r-plus": "cohere",
  "command-r": "cohere",
  "command": "cohere",
  "command-light": "cohere",
  "command-nightly": "cohere",
  "command-light-nightly": "cohere",

  // Nvidia models
  "nvidia/llama-3.1-mini": "nvidia",
  "nvidia/llama-3.1-hf": "nvidia",
  "meta/llama-3.1-405b-instruct": "nvidia",
  "meta/llama-3.1-405b": "nvidia",
  "mistralai/mixtral-8x7b-instruct-v0.1": "nvidia",
  "google/gemma-2-27b-it": "nvidia",

  // Hugging Face models
  "meta-llama/Llama-3.1-70B-Instruct": "huggingface",
  "google/gemma-7b": "huggingface",

  // Cerebras models
  "llama-3.3-70b": "cerebras",
  "llama-3.1-70b": "cerebras",
  "llama-3.1-8b": "cerebras",
  "llama-3-8b": "cerebras",

  // OpenCode models
  "opencode-coder": "opencode",
};

/**
 * Default model for each provider
 * Used when a requested model isn't available on the target provider
 */
export const DEFAULT_MODEL_BY_PROVIDER: Record<Provider, string> = {
  openrouter: "gpt-4o-mini",
  groq: "llama-3.3-70b-versatile",
  together: "meta-llama/Llama-3-70b-chat-hf",
  gemini: "gemini-1.5-flash",
  mistral: "mistral-small-latest",
  cohere: "command-light",
  nvidia: "nvidia/llama-3.1-mini",
  huggingface: "meta-llama/Llama-3.1-70B-Instruct",
  cloudflare: "@cf/meta/llama-3.1-70b-instruct",
  ollama: "llama-3.3-70b-versatile",
  opencode: "opencode-coder",
  cerebras: "llama-3.3-70b",
};

/**
 * Determine which provider to use based on model name
 */
export function getProviderForModel(model: string): Provider {
  if (model in MODEL_PROVIDERS) {
    return MODEL_PROVIDERS[model];
  }

  // Try to detect from model name prefix
  if (model.startsWith("gpt-") || model.startsWith("o1-") || model.startsWith("claude")) {
    return "openrouter";
  }
  if (model.startsWith("llama-")) return "groq";
  if (model.startsWith("mistral")) return "mistral";
  if (model.startsWith("command")) return "cohere";
  if (model.startsWith("gemini")) return "gemini";
  if (model.includes("nvidia")) return "nvidia";
  if (model.includes("huggingface") || model.includes("/")) return "huggingface";

  // Default to Cerebras for unknown models (fast, free tier)
  return "cerebras";
}

/**
 * Get model for a specific provider (uses default if model not native to provider)
 */
export function getModelForProvider(
  requestedModel: string,
  provider: Provider,
  isVirtualModel: boolean = false
): string {
  const requestedProvider = getProviderForModel(requestedModel);
  
  if (provider === requestedProvider && !isVirtualModel) {
    return requestedModel;
  }
  
  return DEFAULT_MODEL_BY_PROVIDER[provider];
}
