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

type ProviderAttempt = {
  response: Response | null;
  status: "success" | "skipped" | "retry";
  error?: string;
};

const PROVIDER_TIMEOUT_MS = 10000;

/**
 * Transform request body for provider-specific formats
 */
function transformRequestBody(provider: Provider, body: any): any {
  // Cohere uses slightly different format
  if (provider === "cohere") {
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const systemMessages = messages
      .filter((message: any) => message.role === "system")
      .map((message: any) =>
        typeof message.content === "string" ? message.content : "",
      )
      .filter((content: string) => content.length > 0);
    const nonSystemMessages = messages.filter(
      (message: any) => message.role !== "system",
    );
    const lastMessage = nonSystemMessages[nonSystemMessages.length - 1];
    return {
      model: body.model,
      message: typeof lastMessage?.content === "string" ? lastMessage.content : "",
      chat_history: nonSystemMessages.slice(0, -1).map((message: any) => ({
        role: message.role === "assistant" ? "CHATBOT" : "USER",
        message: typeof message.content === "string" ? message.content : "",
      })),
      preamble: systemMessages.length > 0 ? systemMessages.join("\n") : undefined,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
    };
  }

  // Most providers are OpenAI-compatible
  return body;
}

function mapCohereFinishReason(reason?: string): "stop" | "length" {
  if (!reason) return "stop";
  const normalized = reason.toLowerCase();
  if (normalized.includes("max_tokens") || normalized.includes("length")) {
    return "length";
  }
  return "stop";
}

function getCohereUsage(meta: any): {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
} | undefined {
  const usage = meta?.billed_units ?? meta?.tokens;
  if (
    !usage ||
    typeof usage.input_tokens !== "number" ||
    typeof usage.output_tokens !== "number"
  ) {
    return undefined;
  }
  return {
    prompt_tokens: usage.input_tokens,
    completion_tokens: usage.output_tokens,
    total_tokens: usage.input_tokens + usage.output_tokens,
  };
}

function normalizeCohereResponse(data: any, model: string): Record<string, unknown> {
  const created = Math.floor(Date.now() / 1000);
  const content = typeof data?.text === "string" ? data.text : "";
  const usage = getCohereUsage(data?.meta);
  const response: Record<string, unknown> = {
    id: data?.generation_id ? `cohere-${data.generation_id}` : `cohere-${created}`,
    object: "chat.completion",
    created,
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: mapCohereFinishReason(data?.finish_reason),
      },
    ],
  };

  if (usage) {
    response.usage = usage;
  }

  return response;
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
): Promise<ProviderAttempt> {
  const apiKey = getApiKey(env, provider);
  if (!apiKey) {
    console.log(`Skipping ${provider}: no API key`);
    return { response: null, status: "skipped", error: "no_api_key" };
  }

  if (provider === "cohere" && body.stream) {
    console.log(`Skipping ${provider}: streaming not supported`);
    return { response: null, status: "skipped", error: "stream_not_supported" };
  }

  try {
    const providerUrl = getProviderUrl(provider, env);
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

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      PROVIDER_TIMEOUT_MS,
    );
    let response: Response;
    try {
      response = await fetch(proxyRequest, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        const responseText = await response.text();
        const contentType =
          response.headers.get("Content-Type") || "application/json";
        return {
          response: new Response(responseText, {
            status: response.status,
            statusText: response.statusText,
            headers: {
              "Content-Type": contentType,
              "X-Provider": provider,
              "X-Model": modelForProvider,
            },
          }),
          status: "success",
        };
      }

      console.error(`${provider} returned ${response.status}`);
      return {
        response: null,
        status: "retry",
        error: `${provider} returned ${response.status}`,
      };
    }

    // Handle Streaming
    if (body.stream) {
      return {
        response: new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Provider": provider,
            "X-Model": modelForProvider,
          },
        }),
        status: "success",
      };
    }

    // Handle Non-Streaming (Buffer)
    if (provider === "cohere") {
      const responseData = await response.json();
      const normalizedResponse = normalizeCohereResponse(
        responseData,
        modelForProvider,
      );
      return {
        response: new Response(JSON.stringify(normalizedResponse), {
          status: response.status,
          statusText: response.statusText,
          headers: {
            "Content-Type": "application/json",
            "X-Provider": provider,
            "X-Model": modelForProvider,
          },
        }),
        status: "success",
      };
    }

    const responseText = await response.text();

    // Success!
    return {
      response: new Response(responseText, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          "Content-Type": "application/json",
          "X-Provider": provider,
          "X-Model": modelForProvider,
        },
      }),
      status: "success",
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    if (error instanceof Error && error.name === "AbortError") {
      console.error(`${provider} timed out`);
      return { response: null, status: "retry", error: `${provider} timed out` };
    }
    console.error(`Error with ${provider}:`, error);
    return { response: null, status: "retry", error: errorMessage };
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
    const body = (await request.json()) as { model?: string; stream?: boolean };

    if (!body.model || typeof body.model !== "string") {
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

    if (body.stream && requestedProvider === "cohere") {
      return jsonError(
        "Streaming is not supported for Cohere",
        "invalid_request_error",
        400
      );
    }

    // Try the requested provider first, then fallback to others
    const providersToTry = [
      requestedProvider,
      ...availableProviders.filter((p) => p !== requestedProvider),
    ].filter((p, index, self) => self.indexOf(p) === index);

    let lastError: string = "Unknown error";

    for (const provider of providersToTry) {
      const result = await tryProvider(provider, body, env, isVirtualModel);
      if (result.response) {
        return result.response;
      }
      if (result.status === "retry") {
        lastError = result.error ?? `${provider} failed`;
      }
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
