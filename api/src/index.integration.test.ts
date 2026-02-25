import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "./index.js";
import { getCurrentDayNumber, issueJwt } from "./lib/auth.js";
import { FREE_LIMITS } from "./lib/usage.js";
import { MemoryD1 } from "./test/memory-d1.js";

const API_BASE_URL = "https://api.example.test";

function chatSuccessResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      id: "chatcmpl_integration",
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
      headers: { "Content-Type": "application/json" },
    },
  );
}

function createEnv(db: MemoryD1, overrides: Partial<Env> = {}): Env {
  return {
    DB: db as unknown as D1Database,
    JWT_SECRET: "integration-secret",
    OPENROUTER_API_KEY: "openrouter-test-key",
    ...overrides,
  };
}

function chatRequest(token?: string, headers: Record<string, string> = {}): Request {
  return new Request(`${API_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b",
      messages: [{ role: "user", content: "hello" }],
    }),
  });
}

async function issueToken(userId: string): Promise<string> {
  return issueJwt("integration-secret", { user_id: userId });
}

describe("API worker strict integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Math, "random").mockReturnValue(1);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects /v1/chat/completions without auth token", async () => {
    const db = new MemoryD1();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(chatRequest(undefined, {
      "X-Anglicus-Feature": "tutor",
    }), createEnv(db));

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload).toEqual({ error: "Auth required" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects free-user chat request without feature header", async () => {
    const db = new MemoryD1();
    db.seedUser({ id: "user-feature", auth_provider: "email", plan_type: "free" });
    const token = await issueToken("user-feature");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(chatRequest(token), createEnv(db));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload).toEqual({ error: "feature_required" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("increments usage only after successful provider response", async () => {
    const db = new MemoryD1();
    db.seedUser({ id: "usage-user", auth_provider: "email", plan_type: "free" });
    const token = await issueToken("usage-user");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(chatSuccessResponse("ok"))
      .mockResolvedValueOnce(new Response("provider fail", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const success = await worker.fetch(
      chatRequest(token, { "X-Anglicus-Feature": "tutor" }),
      createEnv(db),
    );
    expect(success.status).toBe(200);

    const day = getCurrentDayNumber();
    expect(db.getUsage("usage-user", day, "tutor")).toBe(1);

    const failure = await worker.fetch(
      chatRequest(token, { "X-Anglicus-Feature": "tutor" }),
      createEnv(db),
    );
    expect(failure.status).toBe(500);
    expect(db.getUsage("usage-user", day, "tutor")).toBe(1);
  });

  it("returns limit_reached with upgrade_url and skips provider call at limit", async () => {
    const db = new MemoryD1();
    db.seedUser({ id: "limit-user", auth_provider: "email", plan_type: "free" });
    const token = await issueToken("limit-user");
    const day = getCurrentDayNumber();
    db.setUsage("limit-user", day, "tutor", FREE_LIMITS.tutor);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      chatRequest(token, { "X-Anglicus-Feature": "tutor" }),
      createEnv(db),
    );

    expect(response.status).toBe(429);
    const payload = await response.json();
    expect(payload).toEqual({ error: "limit_reached", upgrade_url: "/billing" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bypasses free-limit checks for BYOK-auth users", async () => {
    const db = new MemoryD1();
    db.seedUser({ id: "byok-user", auth_provider: "byok", plan_type: "free" });
    const token = await issueToken("byok-user");
    const fetchMock = vi.fn().mockResolvedValue(chatSuccessResponse("byok path"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(chatRequest(token), createEnv(db));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns deterministic rate-limit headers and blocks repeated calls", async () => {
    const db = new MemoryD1();
    db.seedUser({ id: "rate-user", auth_provider: "byok", plan_type: "free" });
    const token = await issueToken("rate-user");
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => chatSuccessResponse("rate ok"));
    vi.stubGlobal("fetch", fetchMock);

    const env = createEnv(db);

    const first = await worker.fetch(
      chatRequest(token, {
        "CF-Connecting-IP": "9.9.9.9",
      }),
      env,
    );
    expect(first.status).toBe(200);

    const limit = Number(first.headers.get("X-RateLimit-Limit") || "0");
    expect(limit).toBeGreaterThan(0);

    for (let i = 0; i < limit - 1; i++) {
      const allowed = await worker.fetch(
        chatRequest(token, {
          "CF-Connecting-IP": "9.9.9.9",
        }),
        env,
      );
      expect(allowed.status).toBe(200);
    }

    const blocked = await worker.fetch(
      chatRequest(token, {
        "CF-Connecting-IP": "9.9.9.9",
      }),
      env,
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("X-RateLimit-Limit")).toBe(String(limit));
    expect(blocked.headers.get("Retry-After")).not.toBeNull();
    const payload = await blocked.json();
    expect(payload.error.type).toBe("rate_limit_error");

    expect(fetchMock).toHaveBeenCalledTimes(limit);
  });

  it("validates /auth/byok base URLs and accepts allowed hosts with model probe", async () => {
    const db = new MemoryD1();
    db.seedUser({ id: "byok-auth-user", auth_provider: "email", plan_type: "free" });
    const token = await issueToken("byok-auth-user");

    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const env = createEnv(db, {
      BYOK_ALLOWED_HOSTS: "api.openai.com",
    });

    const invalidBaseResponse = await worker.fetch(
      new Request(`${API_BASE_URL}/auth/byok`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          apiKey: "sk-test",
          baseUrl: "http://insecure.example",
        }),
      }),
      env,
    );
    expect(invalidBaseResponse.status).toBe(400);
    expect((await invalidBaseResponse.json()).error.message).toBe("Base URL is invalid");

    const disallowedHostResponse = await worker.fetch(
      new Request(`${API_BASE_URL}/auth/byok`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          apiKey: "sk-test",
          baseUrl: "https://evil.example",
        }),
      }),
      env,
    );
    expect(disallowedHostResponse.status).toBe(400);
    expect((await disallowedHostResponse.json()).error.message).toBe(
      "Base URL host is not allowed",
    );

    const successResponse = await worker.fetch(
      new Request(`${API_BASE_URL}/auth/byok`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          apiKey: "sk-test",
          baseUrl: "https://api.openai.com",
        }),
      }),
      env,
    );

    expect(successResponse.status).toBe(200);
    expect(await successResponse.json()).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBeInstanceOf(URL);
    expect((fetchMock.mock.calls[0][0] as URL).toString()).toBe(
      "https://api.openai.com/v1/models",
    );

    expect(db.getUser("byok-auth-user")?.auth_provider).toBe("byok");
  });
});
