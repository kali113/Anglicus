import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../index.js";
import { handleFeedback } from "./feedback.js";

const validEnv: Env = {
  OWNER_EMAIL: "owner@test.com",
  RESEND_API_KEY: "test-key",
};

function createRequest(
  body: Record<string, unknown>,
  contentType: string = "application/json",
): Request {
  return new Request("http://test", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("handleFeedback", () => {
  it("rejects invalid content type", async () => {
    const response = await handleFeedback(
      createRequest({ message: "Test" }, "text/plain"),
      validEnv,
    );
    expect(response.status).toBe(415);
    const data = await response.json();
    expect(data.error.message).toBe("Content-Type must be application/json");
  });

  it("rejects missing message", async () => {
    const response = await handleFeedback(createRequest({}), validEnv);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.message).toBe("Message is required");
  });

  it("rejects invalid email", async () => {
    const response = await handleFeedback(
      createRequest({ message: "Test", email: "not-an-email" }),
      validEnv,
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.message).toBe("Email is invalid");
  });

  it("rejects when service is not configured", async () => {
    const response = await handleFeedback(
      createRequest({ message: "Test" }),
      {},
    );
    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.error.message).toBe("Feedback service not configured");
  });

  it("accepts valid feedback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email-123" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleFeedback(
      createRequest({ message: "Great app!", email: "user@test.com" }),
      validEnv,
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ success: true, message: "Feedback received" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${validEnv.RESEND_API_KEY}`,
        }),
      }),
    );
  });
});
