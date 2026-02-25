import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../index.js";
import { handleFeedback } from "./feedback.js";

const validEnv: Env = {
  OWNER_EMAIL: "owner@test.com",
  EMAIL_PROVIDER: "brevo",
  BREVO_API_KEY: "test-key",
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

describe("handleFeedback strict contracts", () => {
  it("rejects invalid content type", async () => {
    const response = await handleFeedback(
      createRequest({ message: "Test" }, "text/plain"),
      validEnv,
    );
    expect(response.status).toBe(415);
    expect((await response.json()).error.message).toBe(
      "Content-Type must be application/json",
    );
  });

  it("sanitizes HTML-sensitive input before sending provider payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email-123" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleFeedback(
      createRequest({
        message: `<script>alert("x")</script> hello & goodbye`,
        email: "user@test.com",
        page: "<lesson>",
        version: `v1.0 & "stable"`,
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      message: "Feedback received",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");

    const payload = JSON.parse(String(init.body)) as {
      htmlContent: string;
      replyTo?: { email: string };
    };

    expect(payload.htmlContent).toContain(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; hello &amp; goodbye",
    );
    expect(payload.htmlContent).not.toContain("<script>");
    expect(payload.htmlContent).toContain("&lt;lesson&gt;");
    expect(payload.htmlContent).toContain("v1.0 &amp; &quot;stable&quot;");
    expect(payload.replyTo?.email).toBe("user@test.com");
  });

  it("returns 502 when provider rejects feedback delivery", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("provider down", { status: 500 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleFeedback(
      createRequest({ message: "This should fail to send" }),
      validEnv,
    );

    expect(response.status).toBe(502);
    expect((await response.json()).error.message).toBe("Failed to send feedback");
  });

  it("rejects oversized optional fields", async () => {
    const response = await handleFeedback(
      createRequest({
        message: "ok",
        page: "x".repeat(201),
      }),
      validEnv,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toBe("Page is invalid");
  });
});
