import type { Env } from "../index.js";
import { jsonError, jsonSuccess } from "../lib/response.js";
import {
  extractBearerToken,
  generateVerificationCode,
  getVerificationBucket,
  hashEmail,
  hashPassword,
  isValidEmail,
  isValidPassword,
  issueJwt,
  normalizeEmail,
  verifyJwt,
  verifyPassword,
} from "../lib/auth.js";
import {
  createGoogleUser,
  createUser,
  getUserByEmailHash,
  getUserById,
  markUserVerified,
  setAuthProvider,
  updatePendingUser,
} from "../lib/db.js";

const CODE_REGEX = /^\d{6}$/;
const DEFAULT_BYOK_BASE_URL = "https://api.openai.com";
const GOOGLE_TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo";

type GoogleTokenInfo = {
  aud?: string;
  email?: string;
  email_verified?: string;
};

function requireAuthDatabase(env: Env): D1Database | null {
  if (!env.DB) return null;
  return env.DB;
}

async function sendVerificationEmail(
  env: Env,
  email: string,
  code: string,
): Promise<boolean> {
  const fromEmail = env.AUTH_FROM_EMAIL || "Anglicus <auth@anglicus.app>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [email],
      subject: "Anglicus verification code",
      html: `
        <h2>Verify your email</h2>
        <p>Your verification code is:</p>
        <p style="font-size: 24px; font-weight: bold; letter-spacing: 2px;">${code}</p>
        <p>This code expires in 15 minutes.</p>
      `,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Resend API error:", errorText);
    return false;
  }

  return true;
}

async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenInfo | null> {
  const response = await fetch(
    `${GOOGLE_TOKENINFO_ENDPOINT}?id_token=${encodeURIComponent(idToken)}`,
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as GoogleTokenInfo;
  return payload;
}

export async function handleAuthRegister(
  request: Request,
  env: Env,
): Promise<Response> {
  const db = requireAuthDatabase(env);
  if (!db || !env.EMAIL_PEPPER || !env.RESEND_API_KEY) {
    return jsonError("Auth service not configured", "server_error", 503);
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return jsonError(
      "Content-Type must be application/json",
      "invalid_request_error",
      415,
    );
  }

  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };

    if (!body.email || typeof body.email !== "string") {
      return jsonError("Email is required", "invalid_request_error", 400);
    }
    if (!body.password || typeof body.password !== "string") {
      return jsonError("Password is required", "invalid_request_error", 400);
    }

    const normalizedEmail = normalizeEmail(body.email);
    if (!isValidEmail(normalizedEmail)) {
      return jsonError("Email is invalid", "invalid_request_error", 400);
    }
    if (!isValidPassword(body.password)) {
      return jsonError("Password is invalid", "invalid_request_error", 400);
    }

    const emailHash = await hashEmail(normalizedEmail, env.EMAIL_PEPPER);
    const existing = await getUserByEmailHash(db, emailHash);

    if (existing && existing.is_verified) {
      return jsonError("Email already registered", "invalid_request_error", 409);
    }

    const userId = existing?.id ?? crypto.randomUUID();
    const bucket = getVerificationBucket();
    const verificationCode = await generateVerificationCode(
      emailHash,
      userId,
      env.EMAIL_PEPPER,
      bucket,
    );
    const passwordHash = await hashPassword(body.password);

    if (existing) {
      await updatePendingUser(db, userId, passwordHash, verificationCode);
    } else {
      await createUser(db, userId, emailHash, passwordHash, verificationCode);
    }

    const sent = await sendVerificationEmail(env, normalizedEmail, verificationCode);
    if (!sent) {
      return jsonError("Failed to send verification email", "server_error", 502);
    }

    return jsonSuccess({ success: true });
  } catch (error) {
    console.error("Register error:", error);
    return jsonError("Internal server error", "server_error", 500);
  }
}

export async function handleAuthVerify(
  request: Request,
  env: Env,
): Promise<Response> {
  const db = requireAuthDatabase(env);
  if (!db || !env.EMAIL_PEPPER || !env.JWT_SECRET) {
    return jsonError("Auth service not configured", "server_error", 503);
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return jsonError(
      "Content-Type must be application/json",
      "invalid_request_error",
      415,
    );
  }

  try {
    const body = (await request.json()) as { email?: string; code?: string };
    if (!body.email || typeof body.email !== "string") {
      return jsonError("Email is required", "invalid_request_error", 400);
    }
    if (!body.code || typeof body.code !== "string") {
      return jsonError("Verification code is required", "invalid_request_error", 400);
    }

    const normalizedEmail = normalizeEmail(body.email);
    if (!isValidEmail(normalizedEmail)) {
      return jsonError("Email is invalid", "invalid_request_error", 400);
    }
    const code = body.code.trim();
    if (!CODE_REGEX.test(code)) {
      return jsonError("Verification code is invalid", "invalid_request_error", 400);
    }

    const emailHash = await hashEmail(normalizedEmail, env.EMAIL_PEPPER);
    const user = await getUserByEmailHash(db, emailHash);
    if (!user || !user.verification_code) {
      return jsonError("Verification code is invalid", "invalid_request_error", 400);
    }

    if (code !== user.verification_code) {
      return jsonError("Verification code is invalid", "invalid_request_error", 400);
    }

    const bucket = getVerificationBucket();
    const expectedNow = await generateVerificationCode(
      emailHash,
      user.id,
      env.EMAIL_PEPPER,
      bucket,
    );
    if (code !== expectedNow) {
      return jsonError("Verification code expired", "invalid_request_error", 400);
    }

    await markUserVerified(db, user.id);

    const token = await issueJwt(env.JWT_SECRET, {
      user_id: user.id,
      plan_type: user.plan_type,
      auth_provider: user.auth_provider,
    });

    return jsonSuccess({ token });
  } catch (error) {
    console.error("Verify error:", error);
    return jsonError("Internal server error", "server_error", 500);
  }
}

export async function handleAuthLogin(
  request: Request,
  env: Env,
): Promise<Response> {
  const db = requireAuthDatabase(env);
  if (!db || !env.EMAIL_PEPPER || !env.JWT_SECRET) {
    return jsonError("Auth service not configured", "server_error", 503);
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return jsonError(
      "Content-Type must be application/json",
      "invalid_request_error",
      415,
    );
  }

  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };

    if (!body.email || typeof body.email !== "string") {
      return jsonError("Email is required", "invalid_request_error", 400);
    }
    if (!body.password || typeof body.password !== "string") {
      return jsonError("Password is required", "invalid_request_error", 400);
    }

    const normalizedEmail = normalizeEmail(body.email);
    if (!isValidEmail(normalizedEmail)) {
      return jsonError("Email is invalid", "invalid_request_error", 400);
    }

    const emailHash = await hashEmail(normalizedEmail, env.EMAIL_PEPPER);
    const user = await getUserByEmailHash(db, emailHash);
    if (!user || !user.password_hash) {
      return jsonError("Invalid credentials", "invalid_request_error", 401);
    }
    if (!user.is_verified) {
      return jsonError("Email not verified", "invalid_request_error", 403);
    }

    const ok = await verifyPassword(body.password, user.password_hash);
    if (!ok) {
      return jsonError("Invalid credentials", "invalid_request_error", 401);
    }

    const token = await issueJwt(env.JWT_SECRET, {
      user_id: user.id,
      plan_type: user.plan_type,
      auth_provider: user.auth_provider,
    });

    return jsonSuccess({ token });
  } catch (error) {
    console.error("Login error:", error);
    return jsonError("Internal server error", "server_error", 500);
  }
}

export async function handleAuthGoogle(
  request: Request,
  env: Env,
): Promise<Response> {
  const db = requireAuthDatabase(env);
  if (!db || !env.EMAIL_PEPPER || !env.JWT_SECRET) {
    return jsonError("Auth service not configured", "server_error", 503);
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return jsonError(
      "Content-Type must be application/json",
      "invalid_request_error",
      415,
    );
  }

  try {
    const body = (await request.json()) as { idToken?: string };
    if (!body.idToken || typeof body.idToken !== "string") {
      return jsonError("Google ID token is required", "invalid_request_error", 400);
    }

    const tokenInfo = await verifyGoogleIdToken(body.idToken);
    if (!tokenInfo) {
      return jsonError("Invalid Google token", "invalid_request_error", 401);
    }

    if (env.GOOGLE_CLIENT_ID && tokenInfo.aud !== env.GOOGLE_CLIENT_ID) {
      return jsonError("Google token audience mismatch", "invalid_request_error", 401);
    }

    if (!tokenInfo.email || tokenInfo.email_verified !== "true") {
      return jsonError("Google account email is not verified", "invalid_request_error", 401);
    }

    const normalizedEmail = normalizeEmail(tokenInfo.email);
    const emailHash = await hashEmail(normalizedEmail, env.EMAIL_PEPPER);
    const existing = await getUserByEmailHash(db, emailHash);

    const userId = existing?.id ?? crypto.randomUUID();
    if (existing) {
      if (!existing.is_verified) {
        await markUserVerified(db, userId);
      }
      if (existing.auth_provider !== "google") {
        await setAuthProvider(db, userId, "google");
      }
    } else {
      await createGoogleUser(db, userId, emailHash);
    }

    const user = existing ?? (await getUserById(db, userId));
    if (!user) {
      return jsonError("Unable to create account", "server_error", 500);
    }

    const token = await issueJwt(env.JWT_SECRET, {
      user_id: user.id,
      plan_type: user.plan_type,
      auth_provider: "google",
    });

    return jsonSuccess({ token });
  } catch (error) {
    console.error("Google auth error:", error);
    return jsonError("Internal server error", "server_error", 500);
  }
}

export async function handleAuthRefresh(
  request: Request,
  env: Env,
): Promise<Response> {
  const db = requireAuthDatabase(env);
  if (!db || !env.JWT_SECRET) {
    return jsonError("Auth service not configured", "server_error", 503);
  }

  const token = extractBearerToken(request);
  if (!token) {
    return jsonError("Auth required", "invalid_request_error", 401);
  }

  try {
    const payload = await verifyJwt(token, env.JWT_SECRET);
    if (!payload) {
      return jsonError("Invalid token", "invalid_request_error", 401);
    }

    const user = await getUserById(db, payload.user_id);
    if (!user) {
      return jsonError("Invalid token", "invalid_request_error", 401);
    }

    const refreshed = await issueJwt(env.JWT_SECRET, {
      user_id: user.id,
      plan_type: user.plan_type,
      auth_provider: user.auth_provider,
    });

    return jsonSuccess({ token: refreshed });
  } catch (error) {
    console.error("Refresh error:", error);
    return jsonError("Internal server error", "server_error", 500);
  }
}

export async function handleAuthByok(
  request: Request,
  env: Env,
): Promise<Response> {
  const db = requireAuthDatabase(env);
  if (!db || !env.JWT_SECRET) {
    return jsonError("Auth service not configured", "server_error", 503);
  }

  const token = extractBearerToken(request);
  if (!token) {
    return jsonError("Auth required", "invalid_request_error", 401);
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return jsonError(
      "Content-Type must be application/json",
      "invalid_request_error",
      415,
    );
  }

  try {
    const payload = await verifyJwt(token, env.JWT_SECRET);
    if (!payload) {
      return jsonError("Invalid token", "invalid_request_error", 401);
    }

    const user = await getUserById(db, payload.user_id);
    if (!user) {
      return jsonError("Invalid token", "invalid_request_error", 401);
    }

    const body = (await request.json()) as {
      apiKey?: string;
      baseUrl?: string;
    };

    if (!body.apiKey || typeof body.apiKey !== "string") {
      return jsonError("API key is required", "invalid_request_error", 400);
    }

    const baseUrl =
      (typeof body.baseUrl === "string" && body.baseUrl.trim()) ||
      DEFAULT_BYOK_BASE_URL;
    if (!/^https?:\/\//i.test(baseUrl)) {
      return jsonError("Base URL is invalid", "invalid_request_error", 400);
    }

    const normalizedBase = baseUrl.replace(/\/$/, "");
    const response = await fetch(`${normalizedBase}/v1/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${body.apiKey}`,
      },
    });

    if (!response.ok) {
      return jsonError("API key is invalid", "invalid_request_error", 400);
    }

    await setAuthProvider(db, user.id, "byok");

    return jsonSuccess({ success: true });
  } catch (error) {
    console.error("BYOK error:", error);
    return jsonError("Internal server error", "server_error", 500);
  }
}
