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
  it("calls billing config endpoint with an abort signal and returns payload", async () => {
    const getPaymentConfig = await loadGetPaymentConfig();
    const payload = {
      address: "bc1qexample",
      network: "mainnet",
      minSats: 1000,
      subscriptionDays: 30,
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce(payload),
    });

    await expect(getPaymentConfig()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/billing/config"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("throws a clear error when the config endpoint returns a non-ok response", async () => {
    const getPaymentConfig = await loadGetPaymentConfig();
    fetchMock.mockResolvedValueOnce({ ok: false });

    await expect(getPaymentConfig()).rejects.toThrow(
      "No se pudo obtener la configuración de pago",
    );
  });

  it("normalizes DOMException abort errors", async () => {
    const getPaymentConfig = await loadGetPaymentConfig();
    fetchMock.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));

    await expect(getPaymentConfig()).rejects.toThrow("Payment config request timed out");
  });

  it("normalizes abort-like errors that are not DOMException instances", async () => {
    const getPaymentConfig = await loadGetPaymentConfig();
    fetchMock.mockRejectedValueOnce({ name: "AbortError" });

    await expect(getPaymentConfig()).rejects.toThrow("Payment config request timed out");
  });

  it("normalizes abort-like errors while reading the response body", async () => {
    const getPaymentConfig = await loadGetPaymentConfig();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockRejectedValueOnce({ name: "AbortError" }),
    });

    await expect(getPaymentConfig()).rejects.toThrow("Payment config request timed out");
  });

  it("rethrows non-abort errors", async () => {
    const getPaymentConfig = await loadGetPaymentConfig();
    fetchMock.mockRejectedValueOnce(new Error("Network down"));

    await expect(getPaymentConfig()).rejects.toThrow("Network down");
  });
});
