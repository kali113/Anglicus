/**
 * Feedback client for sending user feedback to the backend
 */

import { BACKEND_URL } from "$lib/config/backend-url.js";

export interface FeedbackRequest {
  message: string;
  email?: string;
  page?: string;
  version?: string;
}

export async function sendFeedback(
  feedback: FeedbackRequest,
): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...feedback,
        page: window.location.pathname,
        version: "1.0.0",
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}
