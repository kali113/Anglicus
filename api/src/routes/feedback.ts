/**
 * Feedback endpoint
 * Receives user feedback and sends email to owner via Resend
 */

import type { Env } from "../index.js";

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
      return new Response(
        JSON.stringify({ error: "Content-Type must be application/json" }),
        { status: 415, headers: { "Content-Type": "application/json" } },
      );
    }

    // Parse request body
    const body = (await request.json()) as Partial<FeedbackRequest>;

    if (!body.message || typeof body.message !== "string") {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const message = body.message.trim();
    if (message.length === 0 || message.length > MAX_MESSAGE_LENGTH) {
      return new Response(JSON.stringify({ error: "Message is invalid" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let email: string | undefined;
    if (body.email !== undefined) {
      if (typeof body.email !== "string") {
        return new Response(JSON.stringify({ error: "Email is invalid" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      email = body.email.trim();
      if (email.length === 0) {
        email = undefined;
      }
      if (email && email.length > MAX_EMAIL_LENGTH) {
        return new Response(JSON.stringify({ error: "Email is invalid" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (email && !EMAIL_REGEX.test(email)) {
        return new Response(JSON.stringify({ error: "Email is invalid" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    let page: string | undefined;
    if (body.page !== undefined) {
      if (typeof body.page !== "string") {
        return new Response(JSON.stringify({ error: "Page is invalid" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      page = body.page.trim();
      if (page.length > MAX_FIELD_LENGTH) {
        return new Response(JSON.stringify({ error: "Page is invalid" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    let version: string | undefined;
    if (body.version !== undefined) {
      if (typeof body.version !== "string") {
        return new Response(JSON.stringify({ error: "Version is invalid" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      version = body.version.trim();
      if (version.length > MAX_FIELD_LENGTH) {
        return new Response(JSON.stringify({ error: "Version is invalid" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Validate environment variables
    if (!env.OWNER_EMAIL || !env.RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Feedback service not configured" }),
        { status: 503, headers: { "Content-Type": "application/json" } },
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
      return new Response(
        JSON.stringify({ error: "Failed to send feedback" }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Feedback received" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Feedback endpoint error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
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
