/**
 * OpenAI-compatible chat completions endpoint
 * Proxies requests to multiple AI providers based on model name
 */

import type { Env } from "../index.js";

// Provider base URLs with their API key headers
const PROVIDERS = {
  openai: {
    url: "https://api.openai.com/v1/chat/completions",
    key: "OPENAI_API_KEY",
    header: "Authorization",
    headerPrefix: "Bearer ",
  },
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

type Provider = keyof typeof PROVIDERS;

// Model to provider mapping
const MODEL_PROVIDERS: Record<string, Provider> = {
  // OpenAI models
  "gpt-4o": "openai",
  "gpt-4o-mini": "openai",
  "gpt-4-turbo": "openai",
  "gpt-4": "openai",
  "gpt-3.5-turbo": "openai",
  "o1-preview": "openai",
  "o1-mini": "openai",

  // OpenRouter models (supports many providers)
  "meta-llama/llama-3.3-70b-instruct": "openrouter",
  "google/gemini-flash-1.5-8b": "openrouter",
  "google/gemini-2.0-flash-exp:free": "openrouter",
  "meta-llama/llama-3.1-8b-instruct:free": "openrouter",
  "mistralai/mistral-7b-instruct:free": "openrouter",
  "nousresearch/hermes-3-llama-3.1-405b:free": "openrouter",
  "qwen/qwen-2-7b-instruct:free": "openrouter",

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
  command: "cohere",
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
  "Qwen/Qwen2-72B-Instruct": "huggingface",

  // Cerebras models
  "llama-3.3-70b": "cerebras",
  "llama-3.1-70b": "cerebras",
  "llama-3.1-8b": "cerebras",
  "llama-3-8b": "cerebras",

  // OpenCode models (if applicable)
  "opencode-coder": "opencode",
} as const;

// Provider aliases for quick access
const DEFAULT_MODEL_BY_PROVIDER: Record<Provider, string> = {
  openai: "gpt-4o-mini",
  openrouter: "google/gemini-2.0-flash-exp:free",
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
function getProviderForModel(model: string): Provider {
  if (model in MODEL_PROVIDERS) {
    return MODEL_PROVIDERS[model];
  }

  // Try to detect from model name prefix
  if (model.startsWith("gpt-") || model.startsWith("o1-")) return "openai";
  if (model.startsWith("llama-") && !model.includes("/")) return "groq"; // Groq uses simple names like "llama-3.1-8b"
  if (model.startsWith("mistral") && !model.includes("/")) return "mistral";
  if (model.startsWith("command")) return "cohere";
  if (model.startsWith("gemini")) return "gemini";
  if (model.includes("nvidia")) return "nvidia";
  
  // OpenRouter specific patterns
  if (model.includes("/") && !model.startsWith("@cf/")) {
    // OpenRouter uses formats like: provider/model-name or provider/model:free
    // e.g., meta-llama/llama-3.1-8b-instruct:free, google/gemini-2.0-flash-exp:free
    return "openrouter";
  }

  // Default to OpenRouter for unknown models (most flexible)
  return "openrouter";
}

/**
 * Get API key for provider from environment
 */
function getApiKey(env: Env, provider: Provider): string {
  const keyName = PROVIDERS[provider].key;
  return (env[keyName as keyof Env] as string) || "";
}

/**
 * Transform request body for provider-specific formats
 */
function transformRequestBody(provider: Provider, body: any): any {
  // Most providers are OpenAI-compatible
  if (provider === "cohere") {
    // Cohere uses slightly different format
    return {
      message: body.messages?.[body.messages.length - 1]?.content || "",
      chat_history:
        body.messages?.slice(0, -1).map((m: any) => ({
          role: m.role === "assistant" ? "CHATBOT" : "USER",
          message: m.content,
        })) || [],
      temperature: body.temperature,
      max_tokens: body.max_tokens,
    };
  }

  // Gemini API has different format
  if (provider === "gemini") {
    // Google Gemini uses a different endpoint format
    // The URL transformation is handled separately
  }

  return body;
}

/**
 * POST /v1/chat/completions
 * OpenAI-compatible chat completions endpoint with automatic failover
 */
export async function handleChatCompletions(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    // Parse request body
    const body = (await request.json()) as { model?: string };

    if (!body.model) {
      return new Response(
        JSON.stringify({
          error: {
            message: "model is required",
            type: "invalid_request_error",
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Get list of available providers (with API keys) in priority order
    // Prioritized by: free tier availability, speed, and reliability
    const providerPriority: Provider[] = [
      "openrouter",  // Very flexible, supports many providers, has free models
      "cerebras",    // Very fast, free tier
      "groq",        // Fast, free tier
      "mistral",     // Free tier available
      "huggingface", // Free tier
      "nvidia",      // Free tier
      "cohere",      // Has free tier
      "gemini",      // Has free tier
      "together",
      "openai",
    ];

    // Filter providers that have API keys configured
    const availableProviders = providerPriority.filter((p) => {
      const keyName = PROVIDERS[p].key;
      return !!(env[keyName as keyof Env] as string);
    });

    if (availableProviders.length === 0) {
      return new Response(
        JSON.stringify({
          error: {
            message:
              "No API keys configured. Please configure at least one provider.",
            type: "server_error",
          },
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Determine primary provider from model
    const requestedProvider = getProviderForModel(body.model);

    // Try the requested provider first, then fallback to others
    const providersToTry = [
      requestedProvider,
      ...availableProviders.filter((p) => p !== requestedProvider),
    ].filter((p, index, self) => self.indexOf(p) === index); // Remove duplicates

    let lastError: Error | null = null;

    for (const provider of providersToTry) {
      // Check if this provider has an API key
      const apiKey = getApiKey(env, provider);
      if (!apiKey) {
        console.log(`Skipping ${provider}: no API key`);
        continue;
      }

      try {
        // Get provider config
        const providerConfig = PROVIDERS[provider];
        let providerUrl = providerConfig.url;

        // Handle Cloudflare's account_id placeholder
        if (provider === "cloudflare" && env.CLOUDFLARE_ACCOUNT_ID) {
          providerUrl = providerUrl.replace(
            "{account_id}",
            env.CLOUDFLARE_ACCOUNT_ID,
          );
        }

        // Get appropriate model for this provider
        const modelForProvider =
          provider === requestedProvider
            ? body.model
            : DEFAULT_MODEL_BY_PROVIDER[provider];

        // Build request body with the correct model for this provider
        const requestBody = { ...body, model: modelForProvider };
        const transformedBody = transformRequestBody(provider, requestBody);

        // Build headers
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        headers[providerConfig.header] = providerConfig.headerPrefix + apiKey;

        // Forward request to provider
        const proxyRequest = new Request(providerUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(transformedBody),
        });

        const response = await fetch(proxyRequest);
        const responseText = await response.text();

        // Check for rate limit or server errors
        if (response.status === 429 || response.status >= 500) {
          console.error(
            `${provider} returned ${response.status}, trying next provider...`,
          );
          lastError = new Error(`${provider} error: ${response.status}`);
          continue; // Try next provider
        }

        // Success! Return the response
        return new Response(responseText, {
          status: response.status,
          statusText: response.statusText,
          headers: {
            "Content-Type": "application/json",
            "X-Provider": provider,
            "X-Model": modelForProvider,
          },
        });
      } catch (error) {
        console.error(`Error with ${provider}:`, error);
        lastError = error as Error;
        continue; // Try next provider
      }
    }

    // All providers failed
    return new Response(
      JSON.stringify({
        error: {
          message: `All providers failed. Last error: ${lastError?.message || "Unknown error"}`,
          type: "server_error",
        },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Chat completions error:", error);
    return new Response(
      JSON.stringify({
        error: {
          message: "Internal server error",
          type: "server_error",
        },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

/**
 * GET /v1/models
 * List available models
 */
export async function handleListModels(
  _request: Request,
  _env: Env,
): Promise<Response> {
  const models = Object.entries(MODEL_PROVIDERS).map(([model, provider]) => ({
    id: model,
    object: "model",
    created: Date.now(),
    owned_by: provider,
  }));

  // Also include default models for each provider
  Object.entries(DEFAULT_MODEL_BY_PROVIDER).forEach(([provider, model]) => {
    if (!MODEL_PROVIDERS[model]) {
      models.push({
        id: model,
        object: "model",
        created: Date.now(),
        owned_by: provider,
      });
    }
  });

  return new Response(JSON.stringify({ object: "list", data: models }), {
    headers: { "Content-Type": "application/json" },
  });
}
