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

  const minSats = parseInt(env.BTC_MIN_SATS || "15000", 10);
  const subscriptionDays = parseInt(env.BTC_SUBSCRIPTION_DAYS || "30", 10);
  const priceUsd = env.BTC_PRICE_USD ? Number(env.BTC_PRICE_USD) : undefined;
  const network = normalizeNetwork(env.BTC_NETWORK);

  const response: BillingConfig = {
    address,
    network,
    minSats,
    subscriptionDays,
    priceUsd,
    discountPercent: PROMO_CODE_DISCOUNT_PERCENT,
  };

  return jsonSuccess(response);
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

  const minSats = parseInt(env.BTC_MIN_SATS || "15000", 10);
  const subscriptionDays = parseInt(env.BTC_SUBSCRIPTION_DAYS || "30", 10);
  const requiredSats = applyDiscount(minSats, body.promoToken);
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
  if (!promoToken) return minSats;
  if (!PROMO_CODE_HASHES.includes(promoToken)) return minSats;
  const discounted = Math.round(
    minSats * (1 - PROMO_CODE_DISCOUNT_PERCENT / 100),
  );
  return Math.max(1, discounted);
}
