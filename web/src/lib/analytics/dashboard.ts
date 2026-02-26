import {
  AuthRequestError,
  getToken,
  refreshToken,
  setToken,
} from "$lib/auth/index.js";
import { BACKEND_URL } from "$lib/config/backend-url.js";

export type AnalyticsDashboardPayload = {
  success: true;
  generatedAt: string;
  windowDays: number;
  totals: {
    pageViews: number;
    uniqueVisitors: number;
    uniqueSessions: number;
    identifiedUsers: number;
    signupStarted: number;
    signupCompleted: number;
    onboardingCompleted: number;
    paywallShown: number;
    paymentInitiated: number;
    paymentConfirmed: number;
    reminderEnabled: number;
  };
  funnel: {
    signupCompletionRate: number;
    onboardingRate: number;
    paywallToCheckoutRate: number;
    checkoutToPaymentRate: number;
    paywallToPaymentRate: number;
  };
  trends: Array<{
    day: string;
    pageViews: number;
    signupStarted: number;
    signupCompleted: number;
    paymentConfirmed: number;
  }>;
  topPages: Array<{ label: string; count: number }>;
  topReferrers: Array<{ label: string; count: number }>;
  topCampaigns: Array<{ label: string; count: number }>;
  eventMix: {
    web: Array<{ label: string; count: number }>;
    product: Array<{ label: string; count: number }>;
  };
};

type ErrorPayload = {
  error?: {
    message?: string;
    type?: string;
  };
};

async function parseError(response: Response): Promise<{
  message: string;
  code?: string;
}> {
  const parsed = (await response
    .json()
    .catch(() => null)) as ErrorPayload | null;

  const fallbackMessage =
    response.status === 404
      ? "Analytics endpoint not found (404). Deploy the latest API and verify VITE_BACKEND_URL."
      : "Analytics request failed";

  return {
    message: parsed?.error?.message || fallbackMessage,
    code: parsed?.error?.type,
  };
}

async function fetchWithAuthRetry(url: string): Promise<Response> {
  const token = getToken();
  if (!token) {
    throw new AuthRequestError("Auth required", 401, "invalid_request_error");
  }

  const firstResponse = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (firstResponse.status !== 401) {
    return firstResponse;
  }

  const refreshed = await refreshToken();
  setToken(refreshed);

  return fetch(url, {
    headers: { Authorization: `Bearer ${refreshed}` },
  });
}

export async function fetchAnalyticsDashboard(
  days: number,
): Promise<AnalyticsDashboardPayload> {
  const response = await fetchWithAuthRetry(
    `${BACKEND_URL}/api/analytics/dashboard?days=${encodeURIComponent(String(days))}`,
  );

  if (!response.ok) {
    const parsed = await parseError(response);
    throw new AuthRequestError(parsed.message, response.status, parsed.code);
  }

  const payload = (await response.json()) as AnalyticsDashboardPayload;
  if (!payload || payload.success !== true) {
    throw new Error("Invalid analytics dashboard response");
  }

  return payload;
}
