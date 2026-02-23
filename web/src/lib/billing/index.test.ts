import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.mock("$lib/i18n", () => ({
  t: {
    subscribe(run: (translator: (key: string) => string) => void) {
      run((key: string) => key);
      return () => {};
    },
  },
}));

async function loadGetPaymentConfig() {
  const module = await import("./index");
  return module.getPaymentConfig;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("getPaymentConfig", () => {
  it("normalizes abort-like errors that are not DOMException instances", async () => {
    const getPaymentConfig = await loadGetPaymentConfig();
    fetchMock.mockRejectedValueOnce({ name: "AbortError" });

    await expect(getPaymentConfig()).rejects.toThrow("Payment config request timed out");
  });

  it("rethrows non-abort errors", async () => {
    const getPaymentConfig = await loadGetPaymentConfig();
    fetchMock.mockRejectedValueOnce(new Error("Network down"));

    await expect(getPaymentConfig()).rejects.toThrow("Network down");
  });
});
