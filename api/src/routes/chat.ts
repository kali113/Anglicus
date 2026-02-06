/**
 * OpenAI-compatible chat completions endpoint
 * Proxies requests to multiple AI providers based on model name
 */

import type { Env } from "../index.js";
import {
  PROVIDERS,
  getApiKey,
  getAvailableProviders,
  type Provider,
} from "../lib/providers.js";
import {
  MODEL_PROVIDERS,
  DEFAULT_MODEL_BY_PROVIDER,
  getProviderForModel,
  getModelForProvider,
} from "../lib/models.js";
import { jsonError, jsonSuccess } from "../lib/response.js";

/**
 * Transform request body for provider-specific formats
 */
function transformRequestBody(provider: Provider, body: any): any {
  // Cohere uses slightly different format
  if (provider === "cohere") {
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

  // Most providers are OpenAI-compatible
  return body;
}

/**
 * Build request headers for a provider
 */
function buildProviderHeaders(
  provider: Provider,
  apiKey: string
): Record<string, string> {
  const config = PROVIDERS[provider];
  return {
    "Content-Type": "application/json",
    [config.header]: config.headerPrefix + apiKey,
  };
}

/**
 * Get the provider URL, handling special cases
 */
function getProviderUrl(provider: Provider, env: Env): string {
  let url = PROVIDERS[provider].url;

  // Handle Cloudflare's account_id placeholder
  if (provider === "cloudflare" && env.CLOUDFLARE_ACCOUNT_ID) {
    url = url.replace("{account_id}", env.CLOUDFLARE_ACCOUNT_ID);
  }

  return url;
}

/**
 * Try to complete a request with a specific provider
 */
async function tryProvider(
  provider: Provider,
  body: any,
  env: Env,
  isVirtualModel: boolean
): Promise<Response | null> {
  const apiKey = getApiKey(env, provider);
  if (!apiKey) {
    console.log(`Skipping ${provider}: no API key`);
    return null;
  }

  try {
    const providerUrl = getProviderUrl(provider, env);
    const requestedProvider = getProviderForModel(body.model);
    const modelForProvider = getModelForProvider(
      body.model,
      provider,
      isVirtualModel
    );

    // Build request
    const requestBody = { ...body, model: modelForProvider };
    const transformedBody = transformRequestBody(provider, requestBody);
    const headers = buildProviderHeaders(provider, apiKey);

    const proxyRequest = new Request(providerUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(transformedBody),
    });

    const response = await fetch(proxyRequest);

    if (!response.ok) {
      const responseText = await response.text();
      console.error(
        `${provider} returned ${response.status}, trying next provider... Error: ${responseText}`
      );
      return null;
    }

    // Handle Streaming
    if (body.stream) {
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "X-Provider": provider,
          "X-Model": modelForProvider,
        },
      });
    }

    // Handle Non-Streaming (Buffer)
    const responseText = await response.text();

    // Success!
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
    return null;
  }
}

/**
 * POST /v1/chat/completions
 * OpenAI-compatible chat completions endpoint with automatic failover
 */
export async function handleChatCompletions(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = (await request.json()) as { model?: string };

    if (!body.model) {
      return jsonError("model is required", "invalid_request_error", 400);
    }

    // Get available providers
    const availableProviders = getAvailableProviders(env);
    if (availableProviders.length === 0) {
      return jsonError(
        "No API keys configured. Please configure at least one provider.",
        "server_error",
        500
      );
    }

    // Determine primary provider from model
    const requestedProvider = getProviderForModel(body.model);
    const isVirtualModel = body.model === "anglicus-tutor";

    // Try the requested provider first, then fallback to others
    const providersToTry = [
      requestedProvider,
      ...availableProviders.filter((p) => p !== requestedProvider),
    ].filter((p, index, self) => self.indexOf(p) === index);

    let lastError: string = "Unknown error";

    for (const provider of providersToTry) {
      const result = await tryProvider(provider, body, env, isVirtualModel);
      if (result) {
        return result;
      }
      lastError = `${provider} failed`;
    }

    // All providers failed
    return jsonError(
      `All providers failed. Last error: ${lastError}`,
      "server_error",
      500
    );
  } catch (error) {
    console.error("Chat completions error:", error);
    return jsonError("Internal server error", "server_error", 500);
  }
}

/**
 * GET /v1/models
 * List available models
 */
export async function handleListModels(
  _request: Request,
  _env: Env
): Promise<Response> {
  const models: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
  }> = Object.entries(MODEL_PROVIDERS).map(([model, provider]) => ({
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

  return jsonSuccess({ object: "list", data: models });
}
