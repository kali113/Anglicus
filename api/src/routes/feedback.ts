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

/**
 * POST /api/feedback
 * Send feedback email to owner
 */
export async function handleFeedback(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    // Parse request body
    const body = (await request.json()) as FeedbackRequest;

    if (!body.message || body.message.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate environment variables
    if (!env.OWNER_EMAIL || !env.RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Feedback service not configured" }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    // Prepare email content
    const emailContent = {
      from: "Anglicus Feedback <feedback@anglicus.app>",
      to: [env.OWNER_EMAIL],
      subject: `Anglicus Feedback${body.email ? ` from ${body.email}` : ""}`,
      html: `
				<h2>New Feedback from Anglicus</h2>
				<p><strong>Message:</strong></p>
				<p style="white-space: pre-wrap; background: #f5f5f5; padding: 12px; border-radius: 8px;">${escapeHtml(
          body.message,
        )}</p>
				<hr>
				<p style="color: #666; font-size: 14px;">
					${body.email ? `<strong>Email:</strong> ${escapeHtml(body.email)}<br>` : ""}
					${body.page ? `<strong>Page:</strong> ${escapeHtml(body.page)}<br>` : ""}
					${body.version ? `<strong>Version:</strong> ${escapeHtml(body.version)}<br>` : ""}
					<strong>Time:</strong> ${new Date().toISOString()}
				</p>
			`,
    };

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
