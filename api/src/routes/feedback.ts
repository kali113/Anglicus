/**
 * Feedback endpoint
 * Receives user feedback and sends email to owner via Resend
 */

import type { Env } from "../index.js";
import { jsonError, jsonSuccess } from "../lib/response.js";

interface FeedbackRequest {
  message: string;
  email?: string;
  page?: string;
  version?: string;
}

const MAX_MESSAGE_LENGTH = 5000;
const MAX_EMAIL_LENGTH = 254;
const MAX_FIELD_LENGTH = 200;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/feedback
 * Send feedback email to owner
 */
export async function handleFeedback(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.includes("application/json")) {
      return jsonError(
        "Content-Type must be application/json",
        "invalid_request_error",
        415,
      );
    }

    // Parse request body
    const body = (await request.json()) as Partial<FeedbackRequest>;

    if (!body.message || typeof body.message !== "string") {
      return jsonError("Message is required", "invalid_request_error", 400);
    }

    const message = body.message.trim();
    if (message.length === 0 || message.length > MAX_MESSAGE_LENGTH) {
      return jsonError("Message is invalid", "invalid_request_error", 400);
    }

    let email: string | undefined;
    if (body.email !== undefined) {
      if (typeof body.email !== "string") {
        return jsonError("Email is invalid", "invalid_request_error", 400);
      }
      email = body.email.trim();
      if (email.length === 0) {
        email = undefined;
      }
      if (email && email.length > MAX_EMAIL_LENGTH) {
        return jsonError("Email is invalid", "invalid_request_error", 400);
      }
      if (email && !EMAIL_REGEX.test(email)) {
        return jsonError("Email is invalid", "invalid_request_error", 400);
      }
    }

    let page: string | undefined;
    if (body.page !== undefined) {
      if (typeof body.page !== "string") {
        return jsonError("Page is invalid", "invalid_request_error", 400);
      }
      page = body.page.trim();
      if (page.length > MAX_FIELD_LENGTH) {
        return jsonError("Page is invalid", "invalid_request_error", 400);
      }
    }

    let version: string | undefined;
    if (body.version !== undefined) {
      if (typeof body.version !== "string") {
        return jsonError("Version is invalid", "invalid_request_error", 400);
      }
      version = body.version.trim();
      if (version.length > MAX_FIELD_LENGTH) {
        return jsonError("Version is invalid", "invalid_request_error", 400);
      }
    }

    // Validate environment variables
    if (!env.OWNER_EMAIL || !env.RESEND_API_KEY) {
      return jsonError(
        "Feedback service not configured",
        "server_error",
        503,
      );
    }

    // Prepare email content
    const emailContent: {
      from: string;
      to: string[];
      subject: string;
      html: string;
      reply_to?: string;
    } = {
      from: "Anglicus Feedback <feedback@anglicus.app>",
      to: [env.OWNER_EMAIL],
      subject: "Anglicus Feedback",
      html: `
				<h2>New Feedback from Anglicus</h2>
				<p><strong>Message:</strong></p>
				<p style="white-space: pre-wrap; background: #f5f5f5; padding: 12px; border-radius: 8px;">${escapeHtml(
          message,
        )}</p>
				<hr>
				<p style="color: #666; font-size: 14px;">
					${email ? `<strong>Email:</strong> ${escapeHtml(email)}<br>` : ""}
					${page ? `<strong>Page:</strong> ${escapeHtml(page)}<br>` : ""}
					${version ? `<strong>Version:</strong> ${escapeHtml(version)}<br>` : ""}
					<strong>Time:</strong> ${new Date().toISOString()}
				</p>
			`,
    };

    if (email) {
      emailContent.reply_to = email.replace(/[\r\n]+/g, "");
    }

    // Send email via Resend
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailContent),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error("Resend API error:", errorText);
      return jsonError("Failed to send feedback", "server_error", 502);
    }

    return jsonSuccess({ success: true, message: "Feedback received" });
  } catch (error) {
    console.error("Feedback endpoint error:", error);
    return jsonError("Internal server error", "server_error", 500);
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}
