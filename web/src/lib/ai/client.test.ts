// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  token: null as string | null,
  apiKey: null as string | null,
  settings: {
    apiConfig: {
      tier: "auto" as "auto" | "backend" | "byok" | "puter",
      customBaseUrl: "",
    },
  },
  refreshToken: vi.fn(),
  setToken: vi.fn(),
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

import { getCompletion, testConnection } from "./client.js";

function mockCompletionResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      id: "chatcmpl_test",
      object: "chat.completion",
      created: 0,
      model: "test-model",
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

describe("AI client auth routing", () => {
  it("uses BYOK in auto mode when backend auth token is missing", async () => {
    state.apiKey = "sk-test";
    fetchMock.mockResolvedValueOnce(mockCompletionResponse("Hello from BYOK"));

    const result = await getCompletion(
      [{ role: "user", content: "hello" }],
      { feature: "quickChat" },
    );

    expect(result.provider).toBe("byok");
    expect(result.content).toBe("Hello from BYOK");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(requestUrl).toBe("https://api.openai.com/v1/chat/completions");
    expect((requestInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-test",
    );
  });

  it("allows BYOK connection test without backend auth token", async () => {
    state.apiKey = "sk-test";
    fetchMock.mockResolvedValueOnce(mockCompletionResponse("ok"));

    const result = await testConnection("byok");

    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
