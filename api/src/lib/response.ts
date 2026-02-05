/**
 * Response Utilities
 * Shared response helpers for consistent API responses
 */

/**
 * Create a JSON error response
 */
export function jsonError(
  message: string,
  type: string = "server_error",
  status: number = 500
): Response {
  return new Response(
    JSON.stringify({
      error: {
        message,
        type,
      },
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}

/**
 * Create a JSON success response
 */
export function jsonSuccess(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Create a response with custom headers
 */
export function jsonWithHeaders(
  data: unknown,
  headers: Record<string, string>,
  status: number = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}
