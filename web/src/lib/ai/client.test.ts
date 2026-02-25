// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BACKEND_URL } from "$lib/config/backend-url.js";

const state = vi.hoisted(() => ({
  token: null as string | null,
  apiKey: null as string | null,
  settings: {
    apiConfig: {
      tier: "auto" as "auto" | "backend" | "byok" | "puter",
      customBaseUrl: "",
    },
  },
  refreshToken: vi.fn<() => Promise<string>>(),
  setToken: vi.fn<(token: string) => void>(),
}));

vi.mock("$app/paths", () => ({
  base: "/app",
}));

vi.mock("$lib/storage/base-store.js", () => ({
  isBrowser: () => true,
}));

vi.mock("$lib/auth/index.js", () => {
  class MockAuthRequestError extends Error {
    status: number;
    code?: string;

    constructor(message: string, status: number, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  return {
    AuthRequestError: MockAuthRequestError,
    getToken: () => state.token,
    refreshToken: state.refreshToken,
    setToken: state.setToken,
  };
});

vi.mock("$lib/storage/index.js", () => ({
  getSettings: () => state.settings,
  getApiKey: vi.fn(async () => state.apiKey),
}));

import { AiRequestError, getCompletion, testConnection } from "./client.js";

function completionResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      id: "chatcmpl_strict",
      object: "chat.completion",
      created: 0,
      model: "llama-3.1-8b",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content,
          },
          finish_reason: "stop",
        },
      ],
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

function jsonErrorResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  state.token = null;
  state.apiKey = null;
  state.settings.apiConfig.tier = "auto";
  state.settings.apiConfig.customBaseUrl = "";
  state.refreshToken.mockReset();
  state.setToken.mockReset();

  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AI client strict auth/routing matrix", () => {
  it("uses backend when auth token exists and forwards feature header", async () => {
    state.token = "backend-token";
    fetchMock.mockResolvedValueOnce(completionResponse("backend ok"));

    const result = await getCompletion(
      [{ role: "user", content: "hello" }],
      { feature: "quickChat" },
    );

    expect(result.provider).toBe("backend");
    expect(result.content).toBe("backend ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestUrl).toBe(`${DEFAULT_BACKEND_URL}/v1/chat/completions`);
    expect((requestInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer backend-token",
    );
    expect((requestInit.headers as Record<string, string>)["X-Anglicus-Feature"]).toBe(
      "quickChat",
    );
  });

  it("refreshes token after backend 401 and retries with refreshed token", async () => {
    state.token = "expired-token";
    state.refreshToken.mockResolvedValueOnce("fresh-token");

    fetchMock
      .mockResolvedValueOnce(jsonErrorResponse(401, { error: "invalid" }))
      .mockResolvedValueOnce(completionResponse("retried backend"));

    const result = await getCompletion([
      { role: "user", content: "retry flow" },
    ]);

    expect(result.provider).toBe("backend");
    expect(result.content).toBe("retried backend");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(state.refreshToken).toHaveBeenCalledTimes(1);
    expect(state.setToken).toHaveBeenCalledWith("fresh-token");

    const secondCall = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((secondCall[1].headers as Record<string, string>).Authorization).toBe(
      "Bearer fresh-token",
    );
  });

  it("redirects to login when refresh fails with auth error", async () => {
    state.token = "expired-token";
    const authModule = await import("$lib/auth/index.js");
    state.refreshToken.mockRejectedValueOnce(
      new authModule.AuthRequestError("expired", 401),
    );

    fetchMock.mockResolvedValueOnce(jsonErrorResponse(401, { error: "invalid" }));

    await expect(
      getCompletion([{ role: "user", content: "force refresh failure" }]),
    ).rejects.toBeInstanceOf(AiRequestError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not fallback on backend 429 and surfaces strict limit error", async () => {
    state.token = "backend-token";
    state.apiKey = "sk-byok";

    fetchMock.mockResolvedValueOnce(
      jsonErrorResponse(429, {
        error: "limit_reached",
      }),
    );

    await expect(
      getCompletion([{ role: "user", content: "rate limited" }]),
    ).rejects.toMatchObject({ status: 429, code: "limit_reached" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps strict fallback order backend -> byok -> puter", async () => {
    state.token = "backend-token";
    state.apiKey = "sk-byok";

    fetchMock
      .mockResolvedValueOnce(
        jsonErrorResponse(500, {
          error: { message: "backend down" },
        }),
      )
      .mockResolvedValueOnce(
        jsonErrorResponse(500, {
          error: { message: "byok down" },
        }),
      )
      .mockResolvedValueOnce(completionResponse("puter fallback"));

    const result = await getCompletion([
      { role: "user", content: "fallback test" },
    ]);

    expect(result.provider).toBe("puter");
    expect(result.content).toBe("puter fallback");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      `${DEFAULT_BACKEND_URL}/v1/chat/completions`,
    );
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
    expect((fetchMock.mock.calls[2] as [string])[0]).toBe(
      "https://api.puterjs.com/v1/chat/completions",
    );
  });

  it("normalizes custom BYOK base URL and sends api key auth", async () => {
    state.settings.apiConfig.tier = "byok";
    state.settings.apiConfig.customBaseUrl = "https://custom.example.com/";
    state.apiKey = "sk-custom";
    fetchMock.mockResolvedValueOnce(completionResponse("custom byok"));

    const result = await getCompletion([
      { role: "user", content: "custom url" },
    ]);

    expect(result.provider).toBe("byok");
    expect(result.content).toBe("custom byok");

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestUrl).toBe("https://custom.example.com/v1/chat/completions");
    expect((requestInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-custom",
    );
  });
});

describe("testConnection strict error normalization", () => {
  it("returns explicit byok configuration error when api key is missing", async () => {
    state.apiKey = null;

    const result = await testConnection("byok");
    expect(result).toEqual({
      success: false,
      error: "No API key configurada. Guarda tu API key primero.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps auth failures to friendly login requirement", async () => {
    state.token = null;

    const result = await testConnection("backend");
    expect(result).toEqual({
      success: false,
      error: "Necesitas iniciar sesion",
    });
  });

  it("maps network-like failures to user-facing network error", async () => {
    state.settings.apiConfig.tier = "byok";
    state.apiKey = "sk-test";
    fetchMock.mockRejectedValueOnce(new Error("Failed to fetch"));

    const result = await testConnection("byok");
    expect(result).toEqual({
      success: false,
      error: "Error de red - verifica tu conexión",
    });
  });
});
