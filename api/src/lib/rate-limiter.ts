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
}

export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
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

    // Clean up expired entries
    this.cleanup(now);

    // Get or create entry for this identifier
    let entry = this.store.get(identifier);

    if (!entry || now > entry.resetTime) {
      // Create new entry
      entry = {
        count: 1,
        resetTime: now + windowMs,
      };
      this.store.set(identifier, entry);
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

  return "unknown";
}

/**
 * Create rate limit response headers
 */
export function createRateLimitHeaders(result: {
  allowed: boolean;
  remaining: number;
  resetTime: number;
}): Record<string, string> {
  return {
    "X-RateLimit-Limit": "60",
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": new Date(result.resetTime).toISOString(),
    "Retry-After": Math.ceil((result.resetTime - Date.now()) / 1000).toString(),
  };
}
