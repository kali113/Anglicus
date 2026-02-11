import type { Env } from "../index.js";
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
};

type VerifyResult = {
  status: "pending" | "confirmed";
  paidSats: number;
  requiredSats: number;
  paidUntil?: string;
};

type PromoValidationResult = {
  valid: boolean;
  reason?: "invalid";
  discountPercent?: number;
};

const PROMO_COOKIE_NAME = "anglicus_promo";
const PROMO_CODE_REGEX = /^[A-Z0-9]{8}$/;
const PROMO_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

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

  const minSats = parseInt(env.BTC_MIN_SATS || "18000", 10);
  const subscriptionDays = parseInt(env.BTC_SUBSCRIPTION_DAYS || "30", 10);
  const priceUsd = env.BTC_PRICE_USD
    ? Number(env.BTC_PRICE_USD)
    : 12;
  const network = normalizeNetwork(env.BTC_NETWORK);

  const promoToken = getPromoToken(_request);
  const discountPercent = isPromoTokenValid(promoToken)
    ? PROMO_CODE_DISCOUNT_PERCENT
    : undefined;

  const response: BillingConfig = {
    address,
    network,
    minSats,
    subscriptionDays,
    priceUsd,
    discountPercent,
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

  const response = jsonSuccess({
    valid: true,
    discountPercent: PROMO_CODE_DISCOUNT_PERCENT,
  } satisfies PromoValidationResult);
  response.headers.append("Set-Cookie", buildPromoCookie(codeHash, request));
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

  let body: { txId?: string; promoToken?: string };
  try {
    body = (await request.json()) as { txId?: string; promoToken?: string };
  } catch {
    return jsonError("Invalid JSON body", "invalid_request_error", 400);
  }

  const txId = body.txId?.trim();
  if (!txId) {
    return jsonError("txId is required", "invalid_request_error", 400);
  }

  const minSats = parseInt(env.BTC_MIN_SATS || "18000", 10);
  const subscriptionDays = parseInt(env.BTC_SUBSCRIPTION_DAYS || "30", 10);
  const promoToken = body.promoToken?.trim() || getPromoToken(request);
  const requiredSats = applyDiscount(minSats, promoToken);
  const network = normalizeNetwork(env.BTC_NETWORK);
  const baseUrl = getBlockstreamBaseUrl(network);

  const txResponse = await fetch(`${baseUrl}/tx/${txId}`);
  if (!txResponse.ok) {
    return jsonError("Transaction not found", "invalid_request_error", 404);
  }

  const txData = (await txResponse.json()) as {
    vout?: Array<{ value?: number; scriptpubkey_address?: string }>;
    status?: { confirmed?: boolean };
  };

  const outputs = Array.isArray(txData.vout) ? txData.vout : [];
  const matchingOutput = outputs.find(
    (output) => output.scriptpubkey_address === address,
  );

  if (!matchingOutput || typeof matchingOutput.value !== "number") {
    return jsonError(
      "Payment not found for billing address",
      "payment_error",
      400,
    );
  }

  const paidSats = matchingOutput.value;
  if (paidSats < requiredSats) {
    return jsonError(
      `Payment below required amount (${requiredSats} sats)`,
      "payment_error",
      402,
    );
  }

  const confirmed = Boolean(txData.status?.confirmed);
  const result: VerifyResult = {
    status: confirmed ? "confirmed" : "pending",
    paidSats,
    requiredSats,
  };

  if (confirmed) {
    const paidUntil = new Date(
      Date.now() + subscriptionDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    result.paidUntil = paidUntil;
  }

  return jsonSuccess(result);
}

function normalizeNetwork(value?: string): "mainnet" | "testnet" {
  return value?.toLowerCase() === "testnet" ? "testnet" : "mainnet";
}

function getBlockstreamBaseUrl(network: "mainnet" | "testnet"): string {
  return network === "testnet"
    ? "https://blockstream.info/testnet/api"
    : "https://blockstream.info/api";
}

function applyDiscount(minSats: number, promoToken?: string): number {
  if (!isPromoTokenValid(promoToken)) return minSats;
  const discounted = Math.round(
    minSats * (1 - PROMO_CODE_DISCOUNT_PERCENT / 100),
  );
  return Math.max(1, discounted);
}

function getPromoPepper(env: Env): string | null {
  const pepper = env.PROMO_CODE_PEPPER?.trim();
  return pepper ? pepper : null;
}

function normalizePromoCode(code?: string): string | null {
  const normalized = code?.trim().toUpperCase();
  if (!normalized || !PROMO_CODE_REGEX.test(normalized)) return null;
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

function isPromoTokenValid(promoToken?: string | null): boolean {
  if (!promoToken) return false;
  return PROMO_CODE_HASHES.includes(promoToken);
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

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPromoCode(code: string, pepper: string): Promise<string> {
  const input = `${pepper}:${code}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return toHex(digest);
}
