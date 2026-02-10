import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../index.js";
import {
  handleReminderSubscribe,
  handleReminderUnsubscribe,
  handleReminderTest,
} from "./reminders.js";

class MemoryKV {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: { prefix?: string; cursor?: string }) {
    const prefix = options?.prefix ?? "";
    const keys = Array.from(this.store.keys())
      .filter((key) => key.startsWith(prefix))
      .map((name) => ({ name }));
    return { keys, list_complete: true, cursor: "" };
  }
}

const validEnv: Env = {
  REMINDER_KV: new MemoryKV() as unknown as KVNamespace,
  REMINDER_ENCRYPTION_KEY: "test-secret",
  RESEND_API_KEY: "test-key",
};

function createRequest(body: Record<string, unknown>): Request {
  return new Request("http://test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("reminder endpoints", () => {
  it("subscribes and unsubscribes", async () => {
    const subscribeResponse = await handleReminderSubscribe(
      createRequest({
        email: "user@test.com",
        reminderTime: "20:00",
        timezoneOffsetMinutes: 0,
        frequency: "daily",
        language: "es",
      }),
      validEnv,
    );

    expect(subscribeResponse.status).toBe(200);

    const kv = validEnv.REMINDER_KV as unknown as MemoryKV;
    const listAfterSubscribe = await kv.list({ prefix: "reminder:" });
    expect(listAfterSubscribe.keys.length).toBe(1);

    const unsubscribeResponse = await handleReminderUnsubscribe(
      createRequest({ email: "user@test.com" }),
      validEnv,
    );
    expect(unsubscribeResponse.status).toBe(200);

    const listAfterUnsubscribe = await kv.list({ prefix: "reminder:" });
    expect(listAfterUnsubscribe.keys.length).toBe(0);
  });

  it("sends test reminder email", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email-1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleReminderTest(
      createRequest({ email: "user@test.com", language: "en" }),
      validEnv,
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
