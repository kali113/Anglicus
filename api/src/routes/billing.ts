import type { Env } from "../index.js";
import {
  extractBearerToken,
  getCurrentDayNumber,
  verifyJwt,
} from "../lib/auth.js";
import { getUserById, setUserPlan, type UserRecord } from "../lib/db.js";
import { toHex } from "../lib/crypto.js";
import { jsonError, jsonSuccess } from "../lib/response.js";
import {
  PROMO_CODE_DISCOUNT_PERCENT,
  PROMO_CODE_HASHES,
} from "../lib/promo-codes.js";

type BillingConfig = {
  address: string;
  network: "mainnet" | "testnet";
  minSats: number;
  subscriptionDays: number;
  priceUsd?: number;
  discountPercent?: number;
  discountSource?: "promo" | "referral";
};

type VerifyStatus =
  | "pending_unconfirmed"
  | "pending_confirming"
  | "confirmed"
  | "verification_delayed"
  | "reorg_review";

type VerifyResult = {
  status: VerifyStatus;
  paidSats: number;
  requiredSats: number;
  paidUntil?: string;
  source?: TxSource;
  reason?: string;
  discountSource?: "promo" | "referral";
};

type BillingStatusResult = {
  planType: "free" | "pro";
  planExpiresDay: number | null;
  isActive: boolean;
  effectivePlanType: "free" | "pro";
  paidUntil?: string;
};

type PromoValidationResult = {
  valid: boolean;
  reason?: "invalid";
  discountPercent?: number;
  promoToken?: string;
};

type ReferralValidationResult = {
  valid: boolean;
  reason?: "invalid";
  discountPercent?: number;
  referralToken?: string;
};

const PROMO_COOKIE_NAME = "anglicus_promo";
const REFERRAL_COOKIE_NAME = "anglicus_referral";
const PROMO_CODE_REGEX = /^[A-Z0-9]{8}$/;
const REFERRAL_CODE_REGEX = /^[A-Z0-9]{6,16}$/;
const TX_ID_REGEX = /^[a-fA-F0-9]{64}$/;
const DISCOUNT_TOKEN_REGEX = /^[a-f0-9]{64}\.[a-f0-9]{64}$/;
const PROMO_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const BILLING_VERIFY_TIMEOUT_MS = 10_000;
const DEFAULT_MIN_SATS = 18_000;
const DEFAULT_SUBSCRIPTION_DAYS = 30;
const DEFAULT_PRICE_USD = 12;
const MIN_SATS = 1;
const MAX_SATS = 100_000_000;
const MIN_SUBSCRIPTION_DAYS = 1;
const MAX_SUBSCRIPTION_DAYS = 365;
const MIN_PRICE_USD = 0.01;
const MAX_PRICE_USD = 100_000;
let billingClaimsTableReady = false;

type TxSource = "blockstream" | "mempool";

type TxPayload = {
  vout?: Array<{ value?: number; scriptpubkey_address?: string }>;
  status?: { confirmed?: boolean; block_height?: number };
};

type TxLookupResult =
  | { kind: "success"; source: TxSource; tx: TxPayload }
  | { kind: "not_found"; source: TxSource }
  | { kind: "unavailable"; source: TxSource; error: string };

type BillingAuthContext = {
  db: D1Database;
  user: UserRecord;
};

export async function handleBillingConfig(
  _request: Request,
  env: Env,
): Promise<Response> {
  const address = env.BTC_RECEIVING_ADDRESS;
  if (!address) {
    return jsonError(
      "Billing address is not configured",
      "server_error",
      500,
    );
  }

  const minSats = parseBillingIntegerEnv(
    env.BTC_MIN_SATS,
    DEFAULT_MIN_SATS,
    MIN_SATS,
    MAX_SATS,
  );
  const subscriptionDays = parseBillingIntegerEnv(
    env.BTC_SUBSCRIPTION_DAYS,
    DEFAULT_SUBSCRIPTION_DAYS,
    MIN_SUBSCRIPTION_DAYS,
    MAX_SUBSCRIPTION_DAYS,
  );
  const priceUsd = parseBillingNumberEnv(
    env.BTC_PRICE_USD,
    DEFAULT_PRICE_USD,
    MIN_PRICE_USD,
    MAX_PRICE_USD,
  );
  const network = normalizeNetwork(env.BTC_NETWORK);

  const promoToken = getPromoToken(_request);
  const referralToken = getReferralToken(_request);
  const discount = await resolveDiscount(minSats, promoToken, referralToken, env);

  const response: BillingConfig = {
    address,
    network,
    minSats,
    subscriptionDays,
    priceUsd,
    discountPercent: discount.discountPercent,
    discountSource: discount.discountSource,
  };

  return jsonSuccess(response);
}

export async function handleBillingPromo(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: { code?: string };
  try {
    body = (await request.json()) as { code?: string };
  } catch {
    return jsonError("Invalid JSON body", "invalid_request_error", 400);
  }

  const normalized = normalizePromoCode(body.code);
  if (!normalized) {
    return jsonSuccess({ valid: false, reason: "invalid" } satisfies PromoValidationResult);
  }

  const pepper = getPromoPepper(env);
  if (!pepper) {
    return jsonError("Promo codes are not configured", "server_error", 500);
  }

  const codeHash = await hashPromoCode(normalized, pepper);
  if (!PROMO_CODE_HASHES.includes(codeHash)) {
    return jsonSuccess({ valid: false, reason: "invalid" } satisfies PromoValidationResult);
  }

  const promoToken = await signDiscountToken(codeHash, pepper);
  const response = jsonSuccess({
    valid: true,
    discountPercent: PROMO_CODE_DISCOUNT_PERCENT,
    promoToken,
  } satisfies PromoValidationResult);
  response.headers.append("Set-Cookie", buildPromoCookie(promoToken, request));
  return response;
}

export async function handleBillingReferral(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: { code?: string };
  try {
    body = (await request.json()) as { code?: string };
  } catch {
    return jsonError("Invalid JSON body", "invalid_request_error", 400);
  }

  const normalized = normalizeReferralCode(body.code);
  if (!normalized) {
    return jsonSuccess({ valid: false, reason: "invalid" } satisfies ReferralValidationResult);
  }

  const pepper = getReferralPepper(env);
  const codeHashes = getReferralCodeHashes(env);
  if (!pepper || codeHashes.length === 0) {
    return jsonSuccess({ valid: false, reason: "invalid" } satisfies ReferralValidationResult);
  }

  const codeHash = await hashReferralCode(normalized, pepper);
  if (!codeHashes.includes(codeHash)) {
    return jsonSuccess({ valid: false, reason: "invalid" } satisfies ReferralValidationResult);
  }

  const referralToken = await signDiscountToken(codeHash, pepper);
  const response = jsonSuccess({
    valid: true,
    discountPercent: getReferralDiscountPercent(env),
    referralToken,
  } satisfies ReferralValidationResult);
  response.headers.append("Set-Cookie", buildReferralCookie(referralToken, request));
  return response;
}

export async function handleBillingVerify(
  request: Request,
  env: Env,
): Promise<Response> {
  const address = env.BTC_RECEIVING_ADDRESS;
  if (!address) {
    return jsonError(
      "Billing address is not configured",
      "server_error",
      500,
    );
  }

  const auth = await requireBillingAuth(request, env);
  if (auth.error) {
    return auth.error;
  }

  let body: { txId?: string; promoToken?: string; referralToken?: string };
  try {
    body = (await request.json()) as {
      txId?: string;
      promoToken?: string;
      referralToken?: string;
    };
  } catch {
    return jsonError("Invalid JSON body", "invalid_request_error", 400);
  }

  const txId = body.txId?.trim();
  if (!txId) {
    return jsonError("txId is required", "invalid_request_error", 400);
  }
  if (!TX_ID_REGEX.test(txId)) {
    return jsonError("txId is invalid", "invalid_request_error", 400);
  }

  const minSats = parseBillingIntegerEnv(
    env.BTC_MIN_SATS,
    DEFAULT_MIN_SATS,
    MIN_SATS,
    MAX_SATS,
  );
  const subscriptionDays = parseBillingIntegerEnv(
    env.BTC_SUBSCRIPTION_DAYS,
    DEFAULT_SUBSCRIPTION_DAYS,
    MIN_SUBSCRIPTION_DAYS,
    MAX_SUBSCRIPTION_DAYS,
  );
  const promoToken = body.promoToken?.trim() || getPromoToken(request);
  const referralToken = body.referralToken?.trim() || getReferralToken(request);
  const discount = await resolveDiscount(minSats, promoToken, referralToken, env);
  const requiredSats = discount.requiredSats;
  const network = normalizeNetwork(env.BTC_NETWORK);

  const resolution = await resolveTransaction(txId, network);
  if (resolution.kind === "not_found") {
    return jsonError("Transaction not found", "invalid_request_error", 404);
  }
  if (resolution.kind === "verification_delayed") {
    const delayed: VerifyResult = {
      status: "verification_delayed",
      paidSats: 0,
      requiredSats,
      reason: resolution.reason,
    };
    return jsonSuccess(delayed);
  }
  const txData = resolution.tx;

  const outputs = Array.isArray(txData.vout) ? txData.vout : [];
  const paidSats = outputs.reduce((sum, output) => {
    if (output.scriptpubkey_address !== address) return sum;
    if (typeof output.value !== "number" || !Number.isFinite(output.value)) {
      return sum;
    }
    const normalizedValue = Math.floor(output.value);
    if (normalizedValue <= 0) {
      return sum;
    }
    return sum + normalizedValue;
  }, 0);

  if (paidSats === 0) {
    return jsonError(
      "Payment not found for billing address",
      "payment_error",
      400,
    );
  }

  if (paidSats < requiredSats) {
    return jsonError(
      `Payment below required amount (${requiredSats} sats)`,
      "payment_error",
      402,
    );
  }

  const confirmed = Boolean(txData.status?.confirmed);
  const pendingStatus: VerifyStatus = txData.status?.block_height
    ? "pending_confirming"
    : "pending_unconfirmed";
  const result: VerifyResult = {
    status: confirmed ? "confirmed" : pendingStatus,
    paidSats,
    requiredSats,
    source: resolution.source,
    discountSource: discount.discountSource,
  };

  if (resolution.requiresReorgReview) {
    result.status = "reorg_review";
    result.reason = "Explorer confirmation mismatch detected. Retry shortly.";
    return jsonSuccess(result);
  }

  if (confirmed) {
    const claimResult = await claimBillingTransaction(
      auth.context.db,
      txId,
      auth.context.user.id,
    );
    if (claimResult === "already_claimed_by_other_user") {
      return jsonError(
        "Transaction already used by another account",
        "payment_error",
        409,
      );
    }
    if (claimResult === "already_claimed_by_current_user") {
      const refreshedUser = await getUserById(auth.context.db, auth.context.user.id);
      if (refreshedUser?.plan_expires_day !== null && refreshedUser?.plan_expires_day !== undefined) {
        result.paidUntil = dayNumberToIso(refreshedUser.plan_expires_day);
      }
      result.reason = "Transaction already verified";
      return jsonSuccess(result);
    }

    const currentDay = getCurrentDayNumber();
    const planExpiresDay = currentDay + subscriptionDays;
    try {
      await setUserPlan(auth.context.db, auth.context.user.id, "pro", planExpiresDay);
    } catch (error) {
      await releaseBillingTransactionClaim(auth.context.db, txId, auth.context.user.id);
      throw error;
    }
    const paidUntil = dayNumberToIso(planExpiresDay);
    result.paidUntil = paidUntil;
  }

  return jsonSuccess(result);
}

export async function handleBillingStatus(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await requireBillingAuth(request, env);
  if (auth.error) {
    return auth.error;
  }

  const currentDay = getCurrentDayNumber();
  const user = auth.context.user;
  const isActive =
    user.plan_type === "pro" &&
    user.plan_expires_day !== null &&
    user.plan_expires_day > currentDay;

  const response: BillingStatusResult = {
    planType: user.plan_type,
    planExpiresDay: user.plan_expires_day,
    isActive,
    effectivePlanType: isActive ? "pro" : "free",
    paidUntil:
      user.plan_expires_day !== null
        ? dayNumberToIso(user.plan_expires_day)
        : undefined,
  };

  return jsonSuccess(response);
}

function normalizeNetwork(value?: string): "mainnet" | "testnet" {
  return value?.toLowerCase() === "testnet" ? "testnet" : "mainnet";
}

function parseBillingIntegerEnv(
  rawValue: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(rawValue ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function parseBillingNumberEnv(
  rawValue: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function getBlockstreamBaseUrl(network: "mainnet" | "testnet"): string {
  return network === "testnet"
    ? "https://blockstream.info/testnet/api"
    : "https://blockstream.info/api";
}

function getMempoolBaseUrl(network: "mainnet" | "testnet"): string {
  return network === "testnet"
    ? "https://mempool.space/testnet/api"
    : "https://mempool.space/api";
}

function applyDiscount(minSats: number, percent: number): number {
  const boundedPercent = Math.min(95, Math.max(1, percent));
  const discounted = Math.round(minSats * (1 - boundedPercent / 100));
  return Math.max(1, discounted);
}

async function resolveDiscount(
  minSats: number,
  promoToken: string | null | undefined,
  referralToken: string | null | undefined,
  env: Env,
): Promise<{
  requiredSats: number;
  discountPercent?: number;
  discountSource?: "promo" | "referral";
}> {
  if (await isReferralTokenValid(referralToken, env)) {
    const discountPercent = getReferralDiscountPercent(env);
    return {
      requiredSats: applyDiscount(minSats, discountPercent),
      discountPercent,
      discountSource: "referral",
    };
  }

  if (await isPromoTokenValid(promoToken, env)) {
    return {
      requiredSats: applyDiscount(minSats, PROMO_CODE_DISCOUNT_PERCENT),
      discountPercent: PROMO_CODE_DISCOUNT_PERCENT,
      discountSource: "promo",
    };
  }

  return { requiredSats: minSats };
}

function getPromoPepper(env: Env): string | null {
  const pepper = env.PROMO_CODE_PEPPER?.trim();
  return pepper || null;
}

function getReferralPepper(env: Env): string | null {
  const pepper = env.REFERRAL_CODE_PEPPER?.trim();
  return pepper || null;
}

function getReferralCodeHashes(env: Env): string[] {
  const raw = env.REFERRAL_CODE_HASHES || "";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^[a-f0-9]{64}$/.test(value));
}

function getReferralDiscountPercent(env: Env): number {
  const parsed = Number.parseInt(env.REFERRAL_DISCOUNT_PERCENT || "25", 10);
  if (!Number.isFinite(parsed)) return 25;
  return Math.min(95, Math.max(5, parsed));
}

function normalizePromoCode(code?: string): string | null {
  const normalized = code?.trim().toUpperCase();
  if (!normalized || !PROMO_CODE_REGEX.test(normalized)) return null;
  return normalized;
}

function normalizeReferralCode(code?: string): string | null {
  const normalized = code?.trim().toUpperCase();
  if (!normalized || !REFERRAL_CODE_REGEX.test(normalized)) return null;
  return normalized;
}

function getPromoToken(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;
  const cookie = cookieHeader
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${PROMO_COOKIE_NAME}=`));
  if (!cookie) return null;
  return cookie.split("=")[1] || null;
}

function getReferralToken(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;
  const cookie = cookieHeader
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${REFERRAL_COOKIE_NAME}=`));
  if (!cookie) return null;
  return cookie.split("=")[1] || null;
}

async function isPromoTokenValid(
  promoToken: string | null | undefined,
  env: Env,
): Promise<boolean> {
  if (!promoToken) return false;
  const pepper = getPromoPepper(env);
  if (!pepper) return false;
  const codeHash = await verifySignedDiscountToken(promoToken, pepper);
  if (!codeHash) return false;
  return PROMO_CODE_HASHES.includes(codeHash);
}

async function isReferralTokenValid(
  referralToken: string | null | undefined,
  env: Env,
): Promise<boolean> {
  if (!referralToken) return false;
  const pepper = getReferralPepper(env);
  if (!pepper) return false;
  const codeHash = await verifySignedDiscountToken(referralToken, pepper);
  if (!codeHash) return false;
  return getReferralCodeHashes(env).includes(codeHash);
}

function buildPromoCookie(promoToken: string, request: Request): string {
  const secure = new URL(request.url).protocol === "https:";
  const parts = [
    `${PROMO_COOKIE_NAME}=${promoToken}`,
    `Max-Age=${PROMO_COOKIE_MAX_AGE}`,
    "Path=/api/billing",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function buildReferralCookie(referralToken: string, request: Request): string {
  const secure = new URL(request.url).protocol === "https:";
  const parts = [
    `${REFERRAL_COOKIE_NAME}=${referralToken}`,
    `Max-Age=${PROMO_COOKIE_MAX_AGE}`,
    "Path=/api/billing",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

async function hashPromoCode(code: string, pepper: string): Promise<string> {
  const input = `${pepper}:${code}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return toHex(digest);
}

async function hashReferralCode(code: string, pepper: string): Promise<string> {
  const input = `${pepper}:${code}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return toHex(digest);
}

async function signDiscountToken(codeHash: string, pepper: string): Promise<string> {
  const input = `${pepper}:discount:${codeHash}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return `${codeHash}.${toHex(digest)}`;
}

async function verifySignedDiscountToken(
  token: string,
  pepper: string,
): Promise<string | null> {
  const normalized = token.trim().toLowerCase();
  if (!DISCOUNT_TOKEN_REGEX.test(normalized)) {
    return null;
  }
  const [codeHash, signature] = normalized.split(".");
  if (!codeHash || !signature) {
    return null;
  }
  const expectedToken = await signDiscountToken(codeHash, pepper);
  const expectedSignature = expectedToken.split(".")[1];
  if (!expectedSignature || expectedSignature !== signature) {
    return null;
  }
  return codeHash;
}

function dayNumberToIso(dayNumber: number): string {
  return new Date(dayNumber * 86400000).toISOString();
}

async function requireBillingAuth(
  request: Request,
  env: Env,
): Promise<{ context: BillingAuthContext; error?: undefined } | { error: Response; context?: undefined }> {
  if (!env.DB || !env.JWT_SECRET) {
    return {
      error: jsonError("Auth service not configured", "server_error", 503),
    };
  }

  const token = extractBearerToken(request);
  if (!token) {
    return {
      error: jsonError("Auth required", "invalid_request_error", 401),
    };
  }

  const payload = await verifyJwt(token, env.JWT_SECRET);
  if (!payload) {
    return {
      error: jsonError("Invalid token", "invalid_request_error", 401),
    };
  }

  const user = await getUserById(env.DB, payload.user_id);
  if (!user) {
    return {
      error: jsonError("Invalid token", "invalid_request_error", 401),
    };
  }

  return { context: { db: env.DB, user } };
}

async function resolveTransaction(
  txId: string,
  network: "mainnet" | "testnet",
): Promise<
  | { kind: "success"; source: TxSource; tx: TxPayload; requiresReorgReview: boolean }
  | { kind: "not_found" }
  | { kind: "verification_delayed"; reason: string }
> {
  const primary = await fetchTransactionFromSource("blockstream", txId, network);
  if (primary.kind === "success") {
    const secondary = await fetchTransactionFromSource("mempool", txId, network);
    if (secondary.kind === "success") {
      const primaryConfirmed = Boolean(primary.tx.status?.confirmed);
      const secondaryConfirmed = Boolean(secondary.tx.status?.confirmed);
      return {
        kind: "success",
        source: primary.source,
        tx: primary.tx,
        requiresReorgReview: primaryConfirmed !== secondaryConfirmed,
      };
    }
    return {
      kind: "success",
      source: primary.source,
      tx: primary.tx,
      requiresReorgReview: false,
    };
  }

  const secondary = await fetchTransactionFromSource("mempool", txId, network);
  if (secondary.kind === "success") {
    return {
      kind: "success",
      source: secondary.source,
      tx: secondary.tx,
      requiresReorgReview: false,
    };
  }

  if (primary.kind === "not_found" && secondary.kind === "not_found") {
    return { kind: "not_found" };
  }

  const reasons = [primary, secondary]
    .filter((item): item is Extract<TxLookupResult, { kind: "unavailable" }> => item.kind === "unavailable")
    .map((item) => `${item.source}: ${item.error}`);

  return {
    kind: "verification_delayed",
    reason: reasons.join("; ") || "Unable to verify transaction right now",
  };
}

async function fetchTransactionFromSource(
  source: TxSource,
  txId: string,
  network: "mainnet" | "testnet",
): Promise<TxLookupResult> {
  const baseUrl =
    source === "blockstream"
      ? getBlockstreamBaseUrl(network)
      : getMempoolBaseUrl(network);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BILLING_VERIFY_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/tx/${txId}`, {
      signal: controller.signal,
    });
    if (response.status === 404) {
      return { kind: "not_found", source };
    }
    if (!response.ok) {
      return {
        kind: "unavailable",
        source,
        error: `HTTP ${response.status}`,
      };
    }

    const tx = (await response.json()) as TxPayload;
    return { kind: "success", source, tx };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { kind: "unavailable", source, error: "timeout" };
    }
    return {
      kind: "unavailable",
      source,
      error: error instanceof Error ? error.message : "network_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureBillingClaimsTable(db: D1Database): Promise<void> {
  if (billingClaimsTableReady) return;

  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS billing_tx_claims (tx_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, claimed_day INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    )
    .run();
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_billing_tx_claims_user_id ON billing_tx_claims (user_id)",
    )
    .run();

  billingClaimsTableReady = true;
}

async function claimBillingTransaction(
  db: D1Database,
  txId: string,
  userId: string,
): Promise<"claimed" | "already_claimed_by_current_user" | "already_claimed_by_other_user"> {
  await ensureBillingClaimsTable(db);

  const inserted = await db
    .prepare(
      "INSERT OR IGNORE INTO billing_tx_claims (tx_id, user_id, claimed_day) VALUES (?, ?, ?)",
    )
    .bind(txId.toLowerCase(), userId, getCurrentDayNumber())
    .run();
  if ((inserted.meta?.changes ?? 0) > 0) {
    return "claimed";
  }

  const existing = await db
    .prepare("SELECT user_id FROM billing_tx_claims WHERE tx_id = ? LIMIT 1")
    .bind(txId.toLowerCase())
    .first<{ user_id: string }>();
  if (existing?.user_id === userId) {
    return "already_claimed_by_current_user";
  }
  return "already_claimed_by_other_user";
}

async function releaseBillingTransactionClaim(
  db: D1Database,
  txId: string,
  userId: string,
): Promise<void> {
  await ensureBillingClaimsTable(db);
  await db
    .prepare("DELETE FROM billing_tx_claims WHERE tx_id = ? AND user_id = ?")
    .bind(txId.toLowerCase(), userId)
    .run();
}
