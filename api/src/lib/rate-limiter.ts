/**
 * In-memory rate limiter for Cloudflare Workers
 * Uses a map to track requests per IP within a time window
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitConfig {
  requestsPerMinute: number;
  cleanupInterval?: number;
  maxEntries?: number;
}

export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private config: Required<RateLimitConfig>;
  private checksSinceCleanup = 0;

  constructor(config: RateLimitConfig) {
    this.config = {
      requestsPerMinute: config.requestsPerMinute,
      cleanupInterval: config.cleanupInterval ?? 100,
      maxEntries: config.maxEntries ?? 10000,
    };
  }

  /**
   * Check if a request from the given IP is allowed
   * Returns { allowed: boolean, remaining: number, resetTime: number }
   */
  check(identifier: string): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
  } {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window

    this.checksSinceCleanup++;
    if (this.checksSinceCleanup >= this.config.cleanupInterval) {
      this.cleanup(now);
      this.enforceMaxEntries();
      this.checksSinceCleanup = 0;
    }

    // Get or create entry for this identifier
    let entry = this.store.get(identifier);

    if (!entry || now > entry.resetTime) {
      // Create new entry
      entry = {
        count: 1,
        resetTime: now + windowMs,
      };
      this.store.set(identifier, entry);
      this.enforceMaxEntries();
      return {
        allowed: true,
        remaining: this.config.requestsPerMinute - 1,
        resetTime: entry.resetTime,
      };
    }

    // Check if limit exceeded
    if (entry.count >= this.config.requestsPerMinute) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime,
      };
    }

    // Increment counter
    entry.count++;
    this.store.set(identifier, entry);

    return {
      allowed: true,
      remaining: this.config.requestsPerMinute - entry.count,
      resetTime: entry.resetTime,
    };
  }

  /**
   * Remove expired entries from the store
   */
  private cleanup(now: number): void {
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Reset the rate limit for a specific identifier
   */
  reset(identifier: string): void {
    this.store.delete(identifier);
  }

  /**
   * Get current count for an identifier
   */
  getCount(identifier: string): number {
    const entry = this.store.get(identifier);
    const now = Date.now();
    if (!entry || now > entry.resetTime) {
      return 0;
    }
    return entry.count;
  }

  getLimit(): number {
    return this.config.requestsPerMinute;
  }

  private enforceMaxEntries(): void {
    while (this.store.size > this.config.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (!oldestKey) break;
      this.store.delete(oldestKey);
    }
  }
}

/**
 * Get client IP from Cloudflare Worker request
 */
export function getClientIp(request: Request): string {
  // Try CF-Connecting-IP header (set by Cloudflare)
  const cfIp = request.headers.get("CF-Connecting-IP");
  if (cfIp) return cfIp;

  // Try other common headers
  const forwardedFor = request.headers.get("X-Forwarded-For");
  if (forwardedFor) {
    // Take the first IP in the list
    const ips = forwardedFor.split(",").map((ip) => ip.trim());
    return ips[0] || "unknown";
  }

  const realIp = request.headers.get("X-Real-IP");
  if (realIp) return realIp;

  const cfRay = request.headers.get("CF-Ray") || request.headers.get("CF-RAY");
  const userAgent = request.headers.get("User-Agent");
  const fallbackSource = [cfRay, userAgent].filter(Boolean).join("|");
  if (fallbackSource) {
    return `unknown:${hashIdentifier(fallbackSource)}`;
  }

  return "unknown";
}

function hashIdentifier(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Create rate limit response headers
 */
export function createRateLimitHeaders(result: {
  allowed: boolean;
  remaining: number;
  resetTime: number;
}, limit: number): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": limit.toString(),
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": new Date(result.resetTime).toISOString(),
  };
  if (!result.allowed) {
    headers["Retry-After"] = Math.ceil(
      (result.resetTime - Date.now()) / 1000,
    ).toString();
  }
  return headers;
}

/**
 * Apply rate limit check and generate headers
 */
export function applyRateLimitCheck(
  limiter: RateLimiter,
  request: Request,
): { allowed: boolean; headers: Record<string, string> } {
  const clientIp = getClientIp(request);
  const result = limiter.check(clientIp);
  const headers = createRateLimitHeaders(result, limiter.getLimit());
  return { allowed: result.allowed, headers };
}
