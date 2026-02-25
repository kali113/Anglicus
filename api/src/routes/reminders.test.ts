import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../index.js";
import {
  handleReminderCron,
  handleReminderSubscribe,
  handleReminderUnsubscribe,
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

function createEnv(kv: MemoryKV): Env {
  return {
    EMAIL_PROVIDER: "brevo",
    REMINDER_KV: kv as unknown as KVNamespace,
    REMINDER_ENCRYPTION_KEY: "test-secret",
    BREVO_API_KEY: "test-key",
  };
}

function createRequest(body: Record<string, unknown>): Request {
  return new Request("http://test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("reminder endpoints strict contracts", () => {
  it("stores encrypted subscription data at rest and supports unsubscribe", async () => {
    const kv = new MemoryKV();
    const env = createEnv(kv);

    const response = await handleReminderSubscribe(
      createRequest({
        email: "user@test.com",
        reminderTime: "20:00",
        timezoneOffsetMinutes: 0,
        frequency: "daily",
        language: "es",
      }),
      env,
    );

    expect(response.status).toBe(200);

    const listed = await kv.list({ prefix: "reminder:" });
    expect(listed.keys.length).toBe(1);

    const stored = await kv.get(listed.keys[0].name);
    expect(stored).toBeTruthy();
    expect(stored).not.toContain("user@test.com");
    expect(stored?.startsWith("[")).toBe(true);

    const unsubscribe = await handleReminderUnsubscribe(
      createRequest({ email: "user@test.com" }),
      env,
    );
    expect(unsubscribe.status).toBe(200);

    const listedAfterDelete = await kv.list({ prefix: "reminder:" });
    expect(listedAfterDelete.keys.length).toBe(0);
  });

  it("sends reminder once per local day when within due window", async () => {
    const kv = new MemoryKV();
    const env = createEnv(kv);
    const now = new Date("2026-02-25T20:05:00.000Z");

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email-1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const subscribe = await handleReminderSubscribe(
      createRequest({
        email: "daily@test.com",
        reminderTime: formatTime(now),
        timezoneOffsetMinutes: 0,
        frequency: "daily",
        language: "en",
      }),
      env,
    );
    expect(subscribe.status).toBe(200);

    await handleReminderCron(now, env);
    await handleReminderCron(new Date(now.getTime() + 5 * 60 * 1000), env);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not send reminder when current time is outside send window", async () => {
    const kv = new MemoryKV();
    const env = createEnv(kv);
    const now = new Date("2026-02-25T20:05:00.000Z");

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email-1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const subscribe = await handleReminderSubscribe(
      createRequest({
        email: "late@test.com",
        reminderTime: "23:45",
        timezoneOffsetMinutes: 0,
        frequency: "daily",
        language: "en",
      }),
      env,
    );
    expect(subscribe.status).toBe(200);

    await handleReminderCron(now, env);

    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("rejects non-integer timezone offsets", async () => {
    const kv = new MemoryKV();
    const env = createEnv(kv);

    const response = await handleReminderSubscribe(
      createRequest({
        email: "user@test.com",
        reminderTime: "20:00",
        timezoneOffsetMinutes: 90.5,
        frequency: "daily",
        language: "es",
      }),
      env,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toBe("Timezone offset is invalid");
  });
});
