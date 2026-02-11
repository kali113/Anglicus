import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const VERIFICATION_WINDOW_MS = 15 * 60 * 1000;

export type AuthTokenPayload = {
  user_id: string;
  plan_type?: string;
  auth_provider?: string;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function isValidPassword(password: string): boolean {
  return PASSWORD_REGEX.test(password);
}

export async function hashEmail(email: string, pepper: string): Promise<string> {
  const normalized = normalizeEmail(email);
  return sha256Hex(`${normalized}${pepper}`);
}

export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    bcrypt.hash(password, 12, (err, hashed) => {
      if (err || !hashed) {
        reject(err ?? new Error("Password hash failed"));
        return;
      }
      resolve(hashed);
    });
  });
}

export async function verifyPassword(
  password: string,
  hashed: string,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    bcrypt.compare(password, hashed, (err, same) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(Boolean(same));
    });
  });
}

export function getCurrentDayNumber(): number {
  return Math.floor(Date.now() / 86400000);
}

export function getVerificationBucket(now: number = Date.now()): number {
  return Math.floor(now / VERIFICATION_WINDOW_MS);
}

export async function generateVerificationCode(
  emailHash: string,
  userId: string,
  pepper: string,
  bucket: number,
): Promise<string> {
  const digest = await sha256Hex(`${emailHash}:${userId}:${bucket}:${pepper}`);
  const numeric = parseInt(digest.slice(0, 8), 16) % 1000000;
  return numeric.toString().padStart(6, "0");
}

export async function issueJwt(
  secret: string,
  payload: AuthTokenPayload,
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .sign(new TextEncoder().encode(secret));
}

export async function verifyJwt(
  token: string,
  secret: string,
): Promise<AuthTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (typeof payload.user_id !== "string") return null;
    return {
      user_id: payload.user_id,
      plan_type: typeof payload.plan_type === "string" ? payload.plan_type : undefined,
      auth_provider:
        typeof payload.auth_provider === "string" ? payload.auth_provider : undefined,
    };
  } catch {
    return null;
  }
}

export function extractBearerToken(request: Request): string | null {
  const header =
    request.headers.get("Authorization") || request.headers.get("authorization");
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  if (scheme !== "Bearer" || !value) return null;
  return value.trim();
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
