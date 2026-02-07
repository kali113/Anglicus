import { describe, expect, it } from "vitest";
import { jsonError, jsonSuccess, jsonWithHeaders } from "./response";

describe("response helpers", () => {
  it("creates jsonError responses", async () => {
    const response = jsonError("Oops", "bad_request", 400);

    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).toBe("application/json");

    await expect(response.json()).resolves.toEqual({
      error: {
        message: "Oops",
        type: "bad_request",
      },
    });
  });

  it("creates jsonSuccess responses", async () => {
    const payload = { ok: true };
    const response = jsonSuccess(payload, 201);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(payload);
  });

  it("creates jsonWithHeaders responses", async () => {
    const response = jsonWithHeaders({ ok: true }, { "X-Test": "value" });

    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("X-Test")).toBe("value");
  });
});
