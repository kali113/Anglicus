import type { UsageFeature } from "./usage.js";

export type AuthProvider = "email" | "google" | "byok";
export type PlanType = "free" | "pro";

export type UserRecord = {
  id: string;
  email_hash: string;
  password_hash: string | null;
  verification_code: string | null;
  is_verified: boolean;
  auth_provider: AuthProvider;
  plan_type: PlanType;
  plan_expires_day: number | null;
};

type UserRow = {
  id: string;
  email_hash: string;
  password_hash: string | null;
  verification_code: string | null;
  is_verified: number | boolean;
  auth_provider: string;
  plan_type: string;
  plan_expires_day: number | null;
};

function normalizeUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    email_hash: row.email_hash,
    password_hash: row.password_hash ?? null,
    verification_code: row.verification_code ?? null,
    is_verified: Boolean(row.is_verified),
    auth_provider: (row.auth_provider || "email") as AuthProvider,
    plan_type: (row.plan_type || "free") as PlanType,
    plan_expires_day: row.plan_expires_day ?? null,
  };
}

export async function getUserByEmailHash(
  db: D1Database,
  emailHash: string,
): Promise<UserRecord | null> {
  const row = await db
    .prepare(
      "SELECT id, email_hash, password_hash, verification_code, is_verified, auth_provider, plan_type, plan_expires_day FROM users WHERE email_hash = ? LIMIT 1",
    )
    .bind(emailHash)
    .first<UserRow>();
  return row ? normalizeUser(row) : null;
}

export async function getUserById(
  db: D1Database,
  userId: string,
): Promise<UserRecord | null> {
  const row = await db
    .prepare(
      "SELECT id, email_hash, password_hash, verification_code, is_verified, auth_provider, plan_type, plan_expires_day FROM users WHERE id = ? LIMIT 1",
    )
    .bind(userId)
    .first<UserRow>();
  return row ? normalizeUser(row) : null;
}

export async function createUser(
  db: D1Database,
  userId: string,
  emailHash: string,
  passwordHash: string,
  verificationCode: string,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO users (id, email_hash, password_hash, verification_code, is_verified, auth_provider, plan_type) VALUES (?, ?, ?, ?, 0, 'email', 'free')",
    )
    .bind(userId, emailHash, passwordHash, verificationCode)
    .run();
}

export async function updatePendingUser(
  db: D1Database,
  userId: string,
  passwordHash: string,
  verificationCode: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE users SET password_hash = ?, verification_code = ?, is_verified = 0, auth_provider = 'email' WHERE id = ?",
    )
    .bind(passwordHash, verificationCode, userId)
    .run();
}

export async function markUserVerified(
  db: D1Database,
  userId: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE users SET is_verified = 1, verification_code = NULL WHERE id = ?",
    )
    .bind(userId)
    .run();
}

export async function setAuthProvider(
  db: D1Database,
  userId: string,
  provider: AuthProvider,
): Promise<void> {
  await db
    .prepare("UPDATE users SET auth_provider = ? WHERE id = ?")
    .bind(provider, userId)
    .run();
}

export async function getUsageCount(
  db: D1Database,
  userId: string,
  dayNumber: number,
  feature: UsageFeature,
): Promise<number> {
  const row = await db
    .prepare(
      "SELECT count FROM usage WHERE user_id = ? AND day_number = ? AND feature = ?",
    )
    .bind(userId, dayNumber, feature)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function incrementUsage(
  db: D1Database,
  userId: string,
  dayNumber: number,
  feature: UsageFeature,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO usage (user_id, day_number, feature, count) VALUES (?, ?, ?, 1) ON CONFLICT(user_id, day_number, feature) DO UPDATE SET count = count + 1",
    )
    .bind(userId, dayNumber, feature)
    .run();
}
