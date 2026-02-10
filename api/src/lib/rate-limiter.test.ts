import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RateLimiter,
  applyRateLimitCheck,
  createRateLimitHeaders,
  getClientIp,
} from "./rate-limiter";

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests within limit", () => {
    const limiter = new RateLimiter({ requestsPerMinute: 2 });
    const result = limiter.check("user-1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("blocks requests exceeding limit", () => {
    const limiter = new RateLimiter({ requestsPerMinute: 1 });
    limiter.check("user-2");
    const result = limiter.check("user-2");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets after time window", () => {
    const limiter = new RateLimiter({ requestsPerMinute: 1 });
    limiter.check("user-3");
    vi.advanceTimersByTime(60_000 + 1);
    const result = limiter.check("user-3");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("resets a specific identifier", () => {
    const limiter = new RateLimiter({ requestsPerMinute: 2 });
    limiter.check("user-4");
    expect(limiter.getCount("user-4")).toBe(1);
    limiter.reset("user-4");
    expect(limiter.getCount("user-4")).toBe(0);
  });
});

describe("getClientIp", () => {
  it("prefers CF-Connecting-IP", () => {
    const request = new Request("http://test", {
      headers: { "CF-Connecting-IP": "1.2.3.4" },
    });
    expect(getClientIp(request)).toBe("1.2.3.4");
  });

  it("falls back to X-Forwarded-For", () => {
    const request = new Request("http://test", {
      headers: { "X-Forwarded-For": "5.6.7.8, 9.9.9.9" },
    });
    expect(getClientIp(request)).toBe("5.6.7.8");
  });

  it("falls back to X-Real-IP", () => {
    const request = new Request("http://test", {
      headers: { "X-Real-IP": "10.0.0.1" },
    });
    expect(getClientIp(request)).toBe("10.0.0.1");
  });

  it("returns unknown when no headers are present", () => {
    const request = new Request("http://test", {
      headers: { "User-Agent": "" },
    });
    expect(getClientIp(request)).toBe("unknown");
  });
});

describe("createRateLimitHeaders", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("includes retry header when blocked", () => {
    const resetTime = Date.now() + 30_000;
    const headers = createRateLimitHeaders(
      { allowed: false, remaining: 0, resetTime },
      5,
    );
    expect(headers["X-RateLimit-Limit"]).toBe("5");
    expect(headers["X-RateLimit-Remaining"]).toBe("0");
    expect(headers["Retry-After"]).toBe("30");
  });

  it("omits retry header when allowed", () => {
    const resetTime = Date.now() + 30_000;
    const headers = createRateLimitHeaders(
      { allowed: true, remaining: 4, resetTime },
      5,
    );
    expect(headers["X-RateLimit-Limit"]).toBe("5");
    expect(headers["Retry-After"]).toBeUndefined();
  });
});

describe("applyRateLimitCheck", () => {
  it("returns headers and allowed state", () => {
    const limiter = new RateLimiter({ requestsPerMinute: 1 });
    limiter.check("1.2.3.4");
    const result = applyRateLimitCheck(
      limiter,
      new Request("http://test", {
        headers: { "CF-Connecting-IP": "1.2.3.4" },
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.headers["X-RateLimit-Limit"]).toBe("1");
  });
});
