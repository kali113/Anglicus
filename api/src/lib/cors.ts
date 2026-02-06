/**
 * CORS middleware for Cloudflare Workers
 * Handles cross-origin requests for frontend domains
 */

export interface CorsConfig {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  credentials: boolean;
}

const DEFAULT_CONFIG: CorsConfig = {
  allowedOrigins: [],
  allowedMethods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

/**
 * Parse allowed origins from environment variable
 */
export function parseAllowedOrigins(originsEnv: string): string[] {
  if (!originsEnv) return [];
  return originsEnv
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Check if origin is allowed
 */
function isOriginAllowed(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false;
  if (allowed.includes("*")) return true;
  let hostname: string;
  try {
    hostname = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }

  return allowed.some((allowed) => {
    // Support wildcard subdomains
    if (allowed.startsWith("*.")) {
      const domain = allowed.slice(2).toLowerCase();
      return hostname === domain || hostname.endsWith(`.${domain}`);
    }
    return origin === allowed;
  });
}

/**
 * Create CORS headers for response
 */
export function createCorsHeaders(
  origin: string | null,
  config: CorsConfig = DEFAULT_CONFIG,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": config.allowedMethods.join(", "),
    "Access-Control-Allow-Headers": config.allowedHeaders.join(", "),
  };

  if (config.credentials) {
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  if (origin && isOriginAllowed(origin, config.allowedOrigins)) {
    headers["Access-Control-Allow-Origin"] = origin;
  } else if (!config.credentials && config.allowedOrigins.includes("*")) {
    headers["Access-Control-Allow-Origin"] = "*";
  }

  return headers;
}

/**
 * CORS middleware wrapper for Hono
 */
export function cors(config?: Partial<CorsConfig>) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  return async (c: any, next: any) => {
    const origin = c.req.header("Origin");

    // Handle preflight requests
    if (c.req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: createCorsHeaders(origin, fullConfig),
      });
    }

    // Continue to next handler
    await next();

    // Add CORS headers to response
    const corsHeaders = createCorsHeaders(origin, fullConfig);
    for (const [key, value] of Object.entries(corsHeaders)) {
      c.header(key, value);
    }
  };
}
