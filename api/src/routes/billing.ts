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
  checkoutRails?: BillingCheckoutRailOption[];
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

type CheckoutAsset = "btc" | "bnb" | "eth" | "sol" | "usdt";
type CheckoutNetwork =
  | "bitcoin"
  | "bsc"
  | "ethereum"
  | "polygon"
  | "arbitrum"
  | "solana";

type BillingCheckoutStatus =
  | "awaiting_payment"
  | "pending_confirming"
  | "confirmed"
  | "underpaid"
  | "expired"
  | "verification_delayed"
  | "reorg_review";

type BillingCheckoutCreateResult = {
  sessionId: string;
  address: string;
  asset: CheckoutAsset;
  network: CheckoutNetwork;
  symbol: string;
  requiredAmount: string;
  requiredAmountAtomic: string;
  subscriptionDays: number;
  confirmationsRequired: number;
  tokenContract?: string;
  status: BillingCheckoutStatus;
  expiresAt: string;
  disclaimer: {
    en: string;
    es: string;
  };
};

type BillingCheckoutStatusResult = {
  sessionId: string;
  status: BillingCheckoutStatus;
  asset: CheckoutAsset;
  network: CheckoutNetwork;
  symbol: string;
  requiredAmount: string;
  requiredAmountAtomic: string;
  paidAmount?: string;
  paidAmountAtomic?: string;
  confirmations?: number;
  txHash?: string;
  paidUntil?: string;
  reason?: string;
};

type BillingCheckoutRailOption = {
  asset: CheckoutAsset;
  network: CheckoutNetwork;
  symbol: string;
  label: string;
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
const DEFAULT_CHECKOUT_SESSION_TTL_MINUTES = 60;
const MIN_CHECKOUT_SESSION_TTL_MINUTES = 5;
const MAX_CHECKOUT_SESSION_TTL_MINUTES = 24 * 60;
const DEFAULT_CONFIRMATIONS_REQUIRED = 1;
const MIN_CONFIRMATIONS_REQUIRED = 0;
const MAX_CONFIRMATIONS_REQUIRED = 6;
const BILLING_CHECKOUT_BATCH_SIZE = 200;
const CHECKOUT_SESSION_ID_REGEX = /^[a-zA-Z0-9-]{10,100}$/;
const PRICE_RATE_CACHE_TTL_MS = 2 * 60_000;
const PRICE_RATE_STALE_MS = 2 * 60 * 60_000;
let billingClaimsTableReady = false;

type PriceRateCacheEntry = {
  value: number;
  source: string;
  fetchedAt: number;
};
let bnbUsdRateCache: PriceRateCacheEntry | null = null;
let ethUsdRateCache: PriceRateCacheEntry | null = null;
let solUsdRateCache: PriceRateCacheEntry | null = null;

type TxSource = "blockstream" | "mempool";
type EvmSource = "bscscan" | "etherscan" | "polygonscan" | "arbiscan";
type SolSource = "solana_rpc";

type TxPayload = {
  vout?: Array<{ value?: number; scriptpubkey_address?: string }>;
  status?: { confirmed?: boolean; block_height?: number };
};

type TxLookupResult =
  | { kind: "success"; source: TxSource; tx: TxPayload }
  | { kind: "not_found"; source: TxSource }
  | { kind: "unavailable"; source: TxSource; error: string };

type AddressTxPayload = {
  txid?: string;
  vout?: Array<{ value?: number; scriptpubkey_address?: string }>;
  status?: { confirmed?: boolean; block_height?: number };
};

type AddressLookupResult =
  | { kind: "success"; source: TxSource; txs: AddressTxPayload[] }
  | { kind: "unavailable"; source: TxSource; error: string };

type CheckoutCandidate = {
  txId: string;
  paidAmountAtomic: string;
  confirmations: number;
};

type CheckoutResolution =
  | {
      kind: "success";
      source: TxSource | EvmSource | SolSource;
      candidate: CheckoutCandidate;
      requiresReorgReview: boolean;
    }
  | { kind: "not_found" }
  | { kind: "verification_delayed"; reason: string };

type BillingCheckoutSessionRow = {
  id: string;
  user_id: string;
  address: string;
  address_index: number;
  required_sats: number;
  asset: CheckoutAsset;
  network_key: CheckoutNetwork;
  symbol: string;
  decimals: number;
  required_amount_atomic: string;
  subscription_days: number;
  status: BillingCheckoutStatus;
  paid_sats: number | null;
  paid_amount_atomic: string | null;
  tx_id: string | null;
  confirmations: number | null;
  discount_source: "promo" | "referral" | null;
  token_contract: string | null;
  expires_at: string;
  last_checked_at: string | null;
  confirmed_at: string | null;
  paid_until: string | null;
  reason: string | null;
};

type CheckoutRail = {
  key: string;
  poolKey: string;
  asset: CheckoutAsset;
  network: CheckoutNetwork;
  symbol: string;
  decimals: number;
  railType: "btc" | "evm_native" | "evm_token" | "sol_native";
  addressPool: string[];
  confirmationsRequired: number;
  btcNetwork?: "mainnet" | "testnet";
  explorerApiBase?: string;
  explorerApiKey?: string;
  explorerSource?: EvmSource;
  solanaRpcUrl?: string;
  tokenContract?: string;
  label: string;
};

type EvmExplorerTx = {
  hash?: string;
  to?: string;
  value?: string;
  confirmations?: string;
  isError?: string;
  txreceipt_status?: string;
};

type EvmExplorerTokenTx = EvmExplorerTx & {
  contractAddress?: string;
  tokenDecimal?: string;
};

type SolanaSignatureInfo = {
  signature?: string;
  slot?: number;
  err?: unknown;
  confirmationStatus?: "processed" | "confirmed" | "finalized";
};

type SolanaTransactionPayload = {
  slot?: number;
  meta?: {
    err?: unknown;
    preBalances?: number[];
    postBalances?: number[];
  };
  transaction?: {
    message?: {
      accountKeys?: Array<string | { pubkey?: string }>;
    };
  };
};

type BillingAuthContext = {
  db: D1Database;
  user: UserRecord;
};

export async function handleBillingConfig(
  _request: Request,
  env: Env,
): Promise<Response> {
  const rails = getConfiguredCheckoutRails(env);
  const address =
    env.BTC_RECEIVING_ADDRESS ||
    rails.find((rail) => rail.asset === "btc")?.addressPool[0] ||
    rails[0]?.addressPool[0] ||
    "";
  if (!address && rails.length === 0) {
    return jsonError(
      "Billing checkout is not configured",
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
    checkoutRails: rails.map((rail) => ({
      asset: rail.asset,
      network: rail.network,
      symbol: rail.symbol,
      label: rail.label,
    })),
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

export async function handleBillingCheckoutSessionCreate(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await requireBillingAuth(request, env);
  if (auth.error) {
    return auth.error;
  }
  if (!env.DB) {
    return jsonError("Billing database is not configured", "server_error", 503);
  }

  const rails = getConfiguredCheckoutRails(env);
  if (rails.length === 0) {
    return jsonError(
      "Checkout rails are not configured",
      "server_error",
      503,
    );
  }

  let body: {
    promoToken?: string;
    referralToken?: string;
    asset?: string;
    network?: string;
  } = {};
  try {
    body = (await request.json()) as {
      promoToken?: string;
      referralToken?: string;
      asset?: string;
      network?: string;
    };
  } catch {
    // body is optional for this endpoint
  }

  const selectedRail = selectCheckoutRail(rails, body.asset, body.network);
  if (!selectedRail) {
    return jsonError("Selected asset/network is not supported", "invalid_request_error", 400);
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const ttlMinutes = parseBillingIntegerEnv(
    env.BTC_CHECKOUT_SESSION_TTL_MINUTES,
    DEFAULT_CHECKOUT_SESSION_TTL_MINUTES,
    MIN_CHECKOUT_SESSION_TTL_MINUTES,
    MAX_CHECKOUT_SESSION_TTL_MINUTES,
  );
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000).toISOString();
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
  const monthlyUsd = parseBillingNumberEnv(
    env.BILLING_MONTHLY_USD || env.BTC_PRICE_USD,
    DEFAULT_PRICE_USD,
    MIN_PRICE_USD,
    MAX_PRICE_USD,
  );
  const requiredAmountAtomic = await computeRequiredAmountAtomicForRail(
    selectedRail,
    discount.requiredSats,
    minSats,
    monthlyUsd,
  );
  const requiredSatsCompat =
    selectedRail.asset === "btc" ? Number.parseInt(requiredAmountAtomic, 10) : 0;

  await ensureBillingCheckoutTables(env.DB);
  const existing = await getLatestOpenCheckoutSession(
    env.DB,
    auth.context.user.id,
    selectedRail.asset,
    selectedRail.network,
    nowIso,
  );
  if (existing) {
    const existingPayload = buildCheckoutCreateResult(
      existing,
      selectedRail,
      getCheckoutDisclaimer(),
    );
    return jsonSuccess(existingPayload);
  }

  const addressIndex = await allocateCheckoutAddressIndex(env.DB, selectedRail.poolKey);
  const address = selectedRail.addressPool[addressIndex];
  if (!address) {
    return jsonError(
      "Checkout address pool exhausted. Add more addresses.",
      "server_error",
      503,
    );
  }

  const sessionId = crypto.randomUUID();
  await env.DB
    .prepare(
      "INSERT INTO billing_checkout_sessions (id, user_id, address, address_index, required_sats, asset, network_key, symbol, decimals, required_amount_atomic, subscription_days, status, discount_source, token_contract, created_day, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      sessionId,
      auth.context.user.id,
      address,
      addressIndex,
      requiredSatsCompat,
      selectedRail.asset,
      selectedRail.network,
      selectedRail.symbol,
      selectedRail.decimals,
      requiredAmountAtomic,
      subscriptionDays,
      "awaiting_payment",
      discount.discountSource ?? null,
      selectedRail.tokenContract ?? null,
      getCurrentDayNumber(),
      expiresAt,
    )
    .run();

  const created = await getCheckoutSessionById(env.DB, sessionId);
  if (!created) {
    return jsonError("Failed to create checkout session", "server_error", 500);
  }

  return jsonSuccess(
    buildCheckoutCreateResult(created, selectedRail, getCheckoutDisclaimer()),
  );
}

export async function handleBillingCheckoutSessionStatus(
  request: Request,
  env: Env,
  sessionId: string,
): Promise<Response> {
  const normalizedSessionId = sessionId.trim();
  if (!CHECKOUT_SESSION_ID_REGEX.test(normalizedSessionId)) {
    return jsonError("sessionId is invalid", "invalid_request_error", 400);
  }

  const auth = await requireBillingAuth(request, env);
  if (auth.error) {
    return auth.error;
  }
  if (!env.DB) {
    return jsonError("Billing database is not configured", "server_error", 503);
  }
  const rails = getConfiguredCheckoutRails(env);
  if (rails.length === 0) {
    return jsonError("Checkout rails are not configured", "server_error", 503);
  }

  await ensureBillingCheckoutTables(env.DB);
  const session = await getCheckoutSessionByIdForUser(
    env.DB,
    normalizedSessionId,
    auth.context.user.id,
  );
  if (!session) {
    return jsonError("Checkout session not found", "invalid_request_error", 404);
  }
  const rail = findCheckoutRailForSession(rails, session);
  if (!rail) {
    return jsonError("Checkout rail not configured for this session", "server_error", 503);
  }

  const reconciled = await reconcileCheckoutSession(
    env.DB,
    env,
    rail,
    session,
    auth.context.user.id,
    new Date(),
  );
  return jsonSuccess(buildCheckoutStatusResult(reconciled, rail));
}

export async function handleBillingCheckoutCron(
  scheduledTime: Date,
  env: Env,
): Promise<void> {
  if (!env.DB) return;
  const rails = getConfiguredCheckoutRails(env);
  if (rails.length === 0) return;

  const now = scheduledTime || new Date();
  const nowIso = now.toISOString();

  try {
    await ensureBillingCheckoutTables(env.DB);
    const sessions = await env.DB
      .prepare(
        "SELECT id, user_id, address, address_index, required_sats, asset, network_key, symbol, decimals, required_amount_atomic, subscription_days, status, paid_sats, paid_amount_atomic, tx_id, confirmations, discount_source, token_contract, expires_at, last_checked_at, confirmed_at, paid_until, reason FROM billing_checkout_sessions WHERE status IN ('awaiting_payment', 'pending_confirming', 'underpaid', 'verification_delayed', 'reorg_review') AND expires_at > ? ORDER BY created_at ASC LIMIT ?",
      )
      .bind(nowIso, BILLING_CHECKOUT_BATCH_SIZE)
      .all<BillingCheckoutSessionRow>();

    const rows = Array.isArray(sessions.results) ? sessions.results : [];
    for (const row of rows) {
      try {
        const rail = findCheckoutRailForSession(rails, row);
        if (!rail) continue;
        await reconcileCheckoutSession(env.DB, env, rail, row, row.user_id, now);
      } catch (error) {
        console.error("Checkout session cron reconcile error:", error);
      }
    }
  } catch (error) {
    console.error("Checkout session cron failed:", error);
  }
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

function parseCheckoutAddressPool(rawPool?: string): string[] {
  if (!rawPool) return [];
  return rawPool
    .split(",")
    .map((value) => value.trim())
    .filter(
      (value) =>
        value.length >= 14 &&
        value.length <= 128 &&
        !value.includes(" "),
    );
}

function normalizeCheckoutAsset(value?: string): CheckoutAsset | null {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "btc" ||
    normalized === "bnb" ||
    normalized === "eth" ||
    normalized === "sol" ||
    normalized === "usdt"
  ) {
    return normalized;
  }
  return null;
}

function normalizeCheckoutNetwork(value?: string): CheckoutNetwork | null {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "bitcoin" ||
    normalized === "bsc" ||
    normalized === "ethereum" ||
    normalized === "polygon" ||
    normalized === "arbitrum" ||
    normalized === "solana"
  ) {
    return normalized;
  }
  return null;
}

function getEnvValue(env: Env, key: string): string | undefined {
  return (env as Record<string, string | undefined>)[key];
}

function getConfiguredCheckoutRails(env: Env): CheckoutRail[] {
  const rails: CheckoutRail[] = [];

  const btcPool = parseCheckoutAddressPool(env.BTC_CHECKOUT_ADDRESS_POOL);
  if (btcPool.length > 0) {
    rails.push({
      key: "btc:bitcoin",
      poolKey: "btc:bitcoin",
      asset: "btc",
      network: "bitcoin",
      symbol: "sats",
      decimals: 0,
      railType: "btc",
      addressPool: btcPool,
      confirmationsRequired: parseBillingIntegerEnv(
        env.BTC_CONFIRMATIONS_REQUIRED,
        DEFAULT_CONFIRMATIONS_REQUIRED,
        MIN_CONFIRMATIONS_REQUIRED,
        MAX_CONFIRMATIONS_REQUIRED,
      ),
      btcNetwork: normalizeNetwork(env.BTC_NETWORK),
      label: "Bitcoin (BTC)",
    });
  }

  const evmNetworks: Array<{
    network: Exclude<CheckoutNetwork, "bitcoin" | "solana">;
    source: EvmSource;
    defaultBase: string;
    keyVar: string;
    label: string;
  }> = [
    {
      network: "bsc",
      source: "bscscan",
      defaultBase: "https://api.bscscan.com/api",
      keyVar: "BSCSCAN_API_KEY",
      label: "BNB Chain",
    },
    {
      network: "ethereum",
      source: "etherscan",
      defaultBase: "https://api.etherscan.io/api",
      keyVar: "ETHERSCAN_API_KEY",
      label: "Ethereum",
    },
    {
      network: "polygon",
      source: "polygonscan",
      defaultBase: "https://api.polygonscan.com/api",
      keyVar: "POLYGONSCAN_API_KEY",
      label: "Polygon",
    },
    {
      network: "arbitrum",
      source: "arbiscan",
      defaultBase: "https://api.arbiscan.io/api",
      keyVar: "ARBISCAN_API_KEY",
      label: "Arbitrum",
    },
  ];

  const bnbBscPool = parseCheckoutAddressPool(env.BNB_BSC_CHECKOUT_ADDRESS_POOL);
  if (bnbBscPool.length > 0) {
    const bscConfig = evmNetworks.find((network) => network.network === "bsc");
    rails.push({
      key: "bnb:bsc",
      poolKey: "bnb:bsc",
      asset: "bnb",
      network: "bsc",
      symbol: "BNB",
      decimals: 18,
      railType: "evm_native",
      addressPool: bnbBscPool,
      confirmationsRequired: parseBillingIntegerEnv(
        env.BNB_BSC_CONFIRMATIONS_REQUIRED || env.EVM_CONFIRMATIONS_REQUIRED,
        DEFAULT_CONFIRMATIONS_REQUIRED,
        MIN_CONFIRMATIONS_REQUIRED,
        MAX_CONFIRMATIONS_REQUIRED,
      ),
      explorerApiBase: (env.BSC_SCAN_API_BASE || bscConfig?.defaultBase || "").trim(),
      explorerApiKey: getEnvValue(env, bscConfig?.keyVar || "")?.trim(),
      explorerSource: "bscscan",
      label: "BNB (BNB Chain)",
    });
  }

  const ethEthereumPool = parseCheckoutAddressPool(env.ETH_ETHEREUM_CHECKOUT_ADDRESS_POOL);
  if (ethEthereumPool.length > 0) {
    const ethereumConfig = evmNetworks.find((network) => network.network === "ethereum");
    rails.push({
      key: "eth:ethereum",
      poolKey: "eth:ethereum",
      asset: "eth",
      network: "ethereum",
      symbol: "ETH",
      decimals: 18,
      railType: "evm_native",
      addressPool: ethEthereumPool,
      confirmationsRequired: parseBillingIntegerEnv(
        env.ETH_ETHEREUM_CONFIRMATIONS_REQUIRED || env.EVM_CONFIRMATIONS_REQUIRED,
        DEFAULT_CONFIRMATIONS_REQUIRED,
        MIN_CONFIRMATIONS_REQUIRED,
        MAX_CONFIRMATIONS_REQUIRED,
      ),
      explorerApiBase: (
        env.ETHEREUM_SCAN_API_BASE || ethereumConfig?.defaultBase || ""
      ).trim(),
      explorerApiKey: getEnvValue(env, ethereumConfig?.keyVar || "")?.trim(),
      explorerSource: "etherscan",
      label: "ETH (Ethereum)",
    });
  }

  const solSolanaPool = parseCheckoutAddressPool(env.SOL_SOLANA_CHECKOUT_ADDRESS_POOL);
  if (solSolanaPool.length > 0) {
    rails.push({
      key: "sol:solana",
      poolKey: "sol:solana",
      asset: "sol",
      network: "solana",
      symbol: "SOL",
      decimals: 9,
      railType: "sol_native",
      addressPool: solSolanaPool,
      confirmationsRequired: parseBillingIntegerEnv(
        env.SOL_SOLANA_CONFIRMATIONS_REQUIRED ||
          env.SOLANA_CONFIRMATIONS_REQUIRED ||
          env.EVM_CONFIRMATIONS_REQUIRED,
        DEFAULT_CONFIRMATIONS_REQUIRED,
        MIN_CONFIRMATIONS_REQUIRED,
        MAX_CONFIRMATIONS_REQUIRED,
      ),
      solanaRpcUrl: (env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com").trim(),
      label: "Solana (SOL)",
    });
  }

  const usdtEnabledNetworks = (env.USDT_ENABLED_NETWORKS || "bsc,ethereum")
    .split(",")
    .map((value) => normalizeCheckoutNetwork(value))
    .filter(
      (value): value is Exclude<CheckoutNetwork, "bitcoin" | "solana"> =>
        Boolean(value && value !== "bitcoin" && value !== "solana"),
    );

  for (const network of usdtEnabledNetworks) {
    const networkConfig = evmNetworks.find((item) => item.network === network);
    if (!networkConfig) continue;

    const networkKey = network.toUpperCase();
    const contract = getEnvValue(env, `USDT_${networkKey}_CONTRACT`)?.trim().toLowerCase();
    if (!contract || !/^0x[a-f0-9]{40}$/.test(contract)) {
      continue;
    }
    const pool = parseCheckoutAddressPool(
      getEnvValue(env, `USDT_${networkKey}_CHECKOUT_ADDRESS_POOL`),
    );
    if (pool.length === 0) {
      continue;
    }
    const defaultDecimals = network === "bsc" ? 18 : 6;
    const decimals = parseBillingIntegerEnv(
      getEnvValue(env, `USDT_${networkKey}_DECIMALS`),
      defaultDecimals,
      0,
      30,
    );
    rails.push({
      key: `usdt:${network}`,
      poolKey: `usdt:${network}`,
      asset: "usdt",
      network,
      symbol: "USDT",
      decimals,
      railType: "evm_token",
      addressPool: pool,
      confirmationsRequired: parseBillingIntegerEnv(
        getEnvValue(env, `USDT_${networkKey}_CONFIRMATIONS_REQUIRED`) ||
          env.EVM_CONFIRMATIONS_REQUIRED,
        DEFAULT_CONFIRMATIONS_REQUIRED,
        MIN_CONFIRMATIONS_REQUIRED,
        MAX_CONFIRMATIONS_REQUIRED,
      ),
      explorerApiBase: (
        getEnvValue(env, `${networkKey}_SCAN_API_BASE`) || networkConfig.defaultBase
      ).trim(),
      explorerApiKey: getEnvValue(env, networkConfig.keyVar)?.trim(),
      explorerSource: networkConfig.source,
      tokenContract: contract,
      label: `USDT (${networkConfig.label})`,
    });
  }

  return rails;
}

function selectCheckoutRail(
  rails: CheckoutRail[],
  rawAsset?: string,
  rawNetwork?: string,
): CheckoutRail | null {
  if (rails.length === 0) return null;
  const asset = normalizeCheckoutAsset(rawAsset);
  const network = normalizeCheckoutNetwork(rawNetwork);
  if (asset && network) {
    return rails.find((rail) => rail.asset === asset && rail.network === network) || null;
  }
  if (asset && !network) {
    return rails.find((rail) => rail.asset === asset) || null;
  }
  return rails.find((rail) => rail.asset === "btc") || rails[0] || null;
}

function findCheckoutRailForSession(
  rails: CheckoutRail[],
  session: BillingCheckoutSessionRow,
): CheckoutRail | null {
  const direct = rails.find(
    (rail) => rail.asset === session.asset && rail.network === session.network_key,
  );
  if (direct) return direct;
  return rails.find((rail) => rail.addressPool.includes(session.address)) || null;
}

function getCheckoutDisclaimer(): { en: string; es: string } {
  return {
    en: "Crypto payments are irreversible. Access unlocks after network confirmation.",
    es: "Los pagos en crypto son irreversibles. El acceso se activa tras la confirmacion en red.",
  };
}

function toMicros(value: number): bigint {
  return BigInt(Math.max(0, Math.round(value * 1_000_000)));
}

function formatAtomicAmount(
  atomicAmount: string,
  decimals: number,
  maxFractionDigits = 6,
): string {
  const amount = safeBigInt(atomicAmount);
  if (decimals <= 0) return amount.toString();
  const factor = 10n ** BigInt(decimals);
  const whole = amount / factor;
  const fraction = amount % factor;
  if (fraction === 0n) return whole.toString();
  const fractionRaw = fraction.toString().padStart(decimals, "0");
  const trimmed = fractionRaw.slice(0, Math.min(decimals, maxFractionDigits)).replace(/0+$/, "");
  if (!trimmed) return whole.toString();
  return `${whole.toString()}.${trimmed}`;
}

function safeBigInt(value: string | number | bigint | null | undefined): bigint {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return 0n;
      return BigInt(Math.max(0, Math.floor(value)));
    }
    if (!value) return 0n;
    const normalized = String(value).trim();
    if (!/^[0-9]+$/.test(normalized)) return 0n;
    return BigInt(normalized);
  } catch {
    return 0n;
  }
}

async function computeRequiredAmountAtomicForRail(
  rail: CheckoutRail,
  requiredSats: number,
  minSats: number,
  monthlyUsd: number,
): Promise<string> {
  if (rail.asset === "btc") {
    return String(Math.max(1, requiredSats));
  }
  const discountRatio = minSats > 0 ? requiredSats / minSats : 1;
  const effectiveUsd = Math.max(0.01, monthlyUsd * discountRatio);
  if (rail.asset === "usdt") {
    const usdMicros = toMicros(effectiveUsd);
    const factor = 10n ** BigInt(rail.decimals);
    const atomic = (usdMicros * factor + 1_000_000n - 1n) / 1_000_000n;
    return atomic.toString();
  }
  if (rail.asset === "bnb") {
    const bnbUsd = await getBnbUsdRate();
    const usdMicros = toMicros(effectiveUsd);
    const rateMicros = toMicros(bnbUsd);
    if (rateMicros <= 0n) {
      throw new Error("BNB rate is unavailable");
    }
    const wei = (usdMicros * 10n ** 18n + rateMicros - 1n) / rateMicros;
    return wei.toString();
  }
  if (rail.asset === "eth") {
    const ethUsd = await getEthUsdRate();
    const usdMicros = toMicros(effectiveUsd);
    const rateMicros = toMicros(ethUsd);
    if (rateMicros <= 0n) {
      throw new Error("ETH rate is unavailable");
    }
    const wei = (usdMicros * 10n ** 18n + rateMicros - 1n) / rateMicros;
    return wei.toString();
  }
  if (rail.asset === "sol") {
    const solUsd = await getSolUsdRate();
    const usdMicros = toMicros(effectiveUsd);
    const rateMicros = toMicros(solUsd);
    if (rateMicros <= 0n) {
      throw new Error("SOL rate is unavailable");
    }
    const lamports = (usdMicros * 10n ** 9n + rateMicros - 1n) / rateMicros;
    return lamports.toString();
  }
  return String(Math.max(1, requiredSats));
}

function buildCheckoutCreateResult(
  session: BillingCheckoutSessionRow,
  rail: CheckoutRail,
  disclaimer: { en: string; es: string },
): BillingCheckoutCreateResult {
  return {
    sessionId: session.id,
    address: session.address,
    asset: session.asset,
    network: session.network_key,
    symbol: session.symbol,
    requiredAmount: formatAtomicAmount(session.required_amount_atomic, session.decimals),
    requiredAmountAtomic: session.required_amount_atomic,
    subscriptionDays: session.subscription_days,
    confirmationsRequired: rail.confirmationsRequired,
    tokenContract: session.token_contract ?? undefined,
    status: session.status,
    expiresAt: session.expires_at,
    disclaimer,
  };
}

function buildCheckoutStatusResult(
  session: BillingCheckoutSessionRow,
  rail: CheckoutRail,
): BillingCheckoutStatusResult {
  return {
    sessionId: session.id,
    status: session.status,
    asset: session.asset,
    network: session.network_key,
    symbol: session.symbol,
    requiredAmount: formatAtomicAmount(session.required_amount_atomic, session.decimals),
    requiredAmountAtomic: session.required_amount_atomic,
    paidAmount:
      session.paid_amount_atomic !== null
        ? formatAtomicAmount(session.paid_amount_atomic, session.decimals)
        : undefined,
    paidAmountAtomic: session.paid_amount_atomic ?? undefined,
    confirmations: session.confirmations ?? undefined,
    txHash: session.tx_id ?? undefined,
    paidUntil: session.paid_until ?? undefined,
    reason: session.reason ?? undefined,
  };
}

async function ensureColumn(
  db: D1Database,
  sql: string,
): Promise<void> {
  try {
    await db.prepare(sql).run();
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("duplicate column name")) {
      return;
    }
    throw error;
  }
}

async function ensureBillingCheckoutTables(db: D1Database): Promise<void> {
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS billing_checkout_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, address TEXT NOT NULL, address_index INTEGER NOT NULL UNIQUE, required_sats INTEGER NOT NULL, asset TEXT NOT NULL DEFAULT 'btc', network_key TEXT NOT NULL DEFAULT 'bitcoin', symbol TEXT NOT NULL DEFAULT 'sats', decimals INTEGER NOT NULL DEFAULT 0, required_amount_atomic TEXT NOT NULL DEFAULT '0', subscription_days INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'awaiting_payment', paid_sats INTEGER, paid_amount_atomic TEXT, tx_id TEXT, confirmations INTEGER, discount_source TEXT, token_contract TEXT, created_day INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at TEXT NOT NULL, last_checked_at TEXT, confirmed_at TEXT, paid_until TEXT, reason TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    )
    .run();
  await ensureColumn(
    db,
    "ALTER TABLE billing_checkout_sessions ADD COLUMN asset TEXT NOT NULL DEFAULT 'btc'",
  );
  await ensureColumn(
    db,
    "ALTER TABLE billing_checkout_sessions ADD COLUMN network_key TEXT NOT NULL DEFAULT 'bitcoin'",
  );
  await ensureColumn(
    db,
    "ALTER TABLE billing_checkout_sessions ADD COLUMN symbol TEXT NOT NULL DEFAULT 'sats'",
  );
  await ensureColumn(
    db,
    "ALTER TABLE billing_checkout_sessions ADD COLUMN decimals INTEGER NOT NULL DEFAULT 0",
  );
  await ensureColumn(
    db,
    "ALTER TABLE billing_checkout_sessions ADD COLUMN required_amount_atomic TEXT NOT NULL DEFAULT '0'",
  );
  await ensureColumn(
    db,
    "ALTER TABLE billing_checkout_sessions ADD COLUMN paid_amount_atomic TEXT",
  );
  await ensureColumn(
    db,
    "ALTER TABLE billing_checkout_sessions ADD COLUMN token_contract TEXT",
  );
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_billing_checkout_sessions_user_status ON billing_checkout_sessions (user_id, status, created_at DESC)",
    )
    .run();
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_billing_checkout_sessions_expires_at ON billing_checkout_sessions (expires_at)",
    )
    .run();
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_billing_checkout_sessions_tx_id ON billing_checkout_sessions (tx_id)",
    )
    .run();
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS billing_checkout_address_indices (pool_key TEXT PRIMARY KEY, next_index INTEGER NOT NULL)",
    )
    .run();
}

async function allocateCheckoutAddressIndex(
  db: D1Database,
  poolKey: string,
): Promise<number> {
  await ensureBillingCheckoutTables(db);
  await db
    .prepare(
      "INSERT OR IGNORE INTO billing_checkout_address_indices (pool_key, next_index) VALUES (?, 0)",
    )
    .bind(poolKey)
    .run();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const row = await db
      .prepare(
        "SELECT next_index FROM billing_checkout_address_indices WHERE pool_key = ? LIMIT 1",
      )
      .bind(poolKey)
      .first<{ next_index: number }>();
    if (!row || !Number.isInteger(row.next_index) || row.next_index < 0) {
      throw new Error("billing_checkout_address_indices row is missing");
    }
    const nextIndex = row.next_index;
    const updated = await db
      .prepare(
        "UPDATE billing_checkout_address_indices SET next_index = ? WHERE pool_key = ? AND next_index = ?",
      )
      .bind(nextIndex + 1, poolKey, nextIndex)
      .run();
    if ((updated.meta?.changes ?? 0) > 0) {
      return nextIndex;
    }
  }

  throw new Error("Failed to allocate checkout address index");
}

async function getCheckoutSessionById(
  db: D1Database,
  sessionId: string,
): Promise<BillingCheckoutSessionRow | null> {
  return db
    .prepare(
      "SELECT id, user_id, address, address_index, required_sats, asset, network_key, symbol, decimals, required_amount_atomic, subscription_days, status, paid_sats, paid_amount_atomic, tx_id, confirmations, discount_source, token_contract, expires_at, last_checked_at, confirmed_at, paid_until, reason FROM billing_checkout_sessions WHERE id = ? LIMIT 1",
    )
    .bind(sessionId)
    .first<BillingCheckoutSessionRow>();
}

async function getCheckoutSessionByIdForUser(
  db: D1Database,
  sessionId: string,
  userId: string,
): Promise<BillingCheckoutSessionRow | null> {
  return db
    .prepare(
      "SELECT id, user_id, address, address_index, required_sats, asset, network_key, symbol, decimals, required_amount_atomic, subscription_days, status, paid_sats, paid_amount_atomic, tx_id, confirmations, discount_source, token_contract, expires_at, last_checked_at, confirmed_at, paid_until, reason FROM billing_checkout_sessions WHERE id = ? AND user_id = ? LIMIT 1",
    )
    .bind(sessionId, userId)
    .first<BillingCheckoutSessionRow>();
}

async function getLatestOpenCheckoutSession(
  db: D1Database,
  userId: string,
  asset: CheckoutAsset,
  network: CheckoutNetwork,
  nowIso: string,
): Promise<BillingCheckoutSessionRow | null> {
  return db
    .prepare(
      "SELECT id, user_id, address, address_index, required_sats, asset, network_key, symbol, decimals, required_amount_atomic, subscription_days, status, paid_sats, paid_amount_atomic, tx_id, confirmations, discount_source, token_contract, expires_at, last_checked_at, confirmed_at, paid_until, reason FROM billing_checkout_sessions WHERE user_id = ? AND asset = ? AND network_key = ? AND status IN ('awaiting_payment', 'pending_confirming', 'underpaid', 'verification_delayed', 'reorg_review') AND expires_at > ? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(userId, asset, network, nowIso)
    .first<BillingCheckoutSessionRow>();
}

async function persistCheckoutSessionState(
  db: D1Database,
  session: BillingCheckoutSessionRow,
  update: {
    status: BillingCheckoutStatus;
    paidSats: number | null;
    paidAmountAtomic: string | null;
    txId: string | null;
    confirmations: number | null;
    lastCheckedAt: string;
    confirmedAt: string | null;
    paidUntil: string | null;
    reason: string | null;
  },
): Promise<BillingCheckoutSessionRow> {
  await db
    .prepare(
      "UPDATE billing_checkout_sessions SET status = ?, paid_sats = ?, paid_amount_atomic = ?, tx_id = ?, confirmations = ?, last_checked_at = ?, confirmed_at = ?, paid_until = ?, reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(
      update.status,
      update.paidSats,
      update.paidAmountAtomic,
      update.txId,
      update.confirmations,
      update.lastCheckedAt,
      update.confirmedAt,
      update.paidUntil,
      update.reason,
      session.id,
    )
    .run();

  const refreshed = await getCheckoutSessionById(db, session.id);
  if (refreshed) return refreshed;

  return {
    ...session,
    status: update.status,
    paid_sats: update.paidSats,
    paid_amount_atomic: update.paidAmountAtomic,
    tx_id: update.txId,
    confirmations: update.confirmations,
    last_checked_at: update.lastCheckedAt,
    confirmed_at: update.confirmedAt,
    paid_until: update.paidUntil,
    reason: update.reason,
  };
}

async function reconcileCheckoutSession(
  db: D1Database,
  env: Env,
  rail: CheckoutRail,
  session: BillingCheckoutSessionRow,
  userId: string,
  now: Date,
): Promise<BillingCheckoutSessionRow> {
  const nowIso = now.toISOString();
  if (session.user_id !== userId) {
    return session;
  }
  if (session.status === "confirmed" || session.status === "expired") {
    return session;
  }

  if (session.expires_at <= nowIso) {
    return persistCheckoutSessionState(db, session, {
      status: "expired",
      paidSats: session.paid_sats ?? null,
      paidAmountAtomic: session.paid_amount_atomic ?? null,
      txId: session.tx_id ?? null,
      confirmations: session.confirmations ?? null,
      lastCheckedAt: nowIso,
      confirmedAt: session.confirmed_at ?? null,
      paidUntil: session.paid_until ?? null,
      reason: "Checkout session expired",
    });
  }

  const resolution = await resolveCheckoutForRail(session.address, rail);
  if (resolution.kind === "verification_delayed") {
    return persistCheckoutSessionState(db, session, {
      status: "verification_delayed",
      paidSats: session.paid_sats ?? null,
      paidAmountAtomic: session.paid_amount_atomic ?? null,
      txId: session.tx_id ?? null,
      confirmations: session.confirmations ?? null,
      lastCheckedAt: nowIso,
      confirmedAt: session.confirmed_at ?? null,
      paidUntil: session.paid_until ?? null,
      reason: resolution.reason,
    });
  }
  if (resolution.kind === "not_found") {
    return persistCheckoutSessionState(db, session, {
      status: "awaiting_payment",
      paidSats: null,
      paidAmountAtomic: null,
      txId: null,
      confirmations: 0,
      lastCheckedAt: nowIso,
      confirmedAt: null,
      paidUntil: null,
      reason: null,
    });
  }

  const candidate = resolution.candidate;
  const paidAtomic = safeBigInt(candidate.paidAmountAtomic);
  const requiredAtomic = safeBigInt(session.required_amount_atomic);
  if (paidAtomic < requiredAtomic) {
    return persistCheckoutSessionState(db, session, {
      status: "underpaid",
      paidSats: session.asset === "btc" ? Number(paidAtomic) : null,
      paidAmountAtomic: candidate.paidAmountAtomic,
      txId: candidate.txId,
      confirmations: candidate.confirmations,
      lastCheckedAt: nowIso,
      confirmedAt: null,
      paidUntil: null,
      reason: `Payment below required amount (${session.required_amount_atomic} atomic units)`,
    });
  }

  if (resolution.requiresReorgReview) {
    return persistCheckoutSessionState(db, session, {
      status: "reorg_review",
      paidSats: session.asset === "btc" ? Number(paidAtomic) : null,
      paidAmountAtomic: candidate.paidAmountAtomic,
      txId: candidate.txId,
      confirmations: candidate.confirmations,
      lastCheckedAt: nowIso,
      confirmedAt: null,
      paidUntil: null,
      reason: "Explorer confirmation mismatch detected. Retry shortly.",
    });
  }

  if (candidate.confirmations < rail.confirmationsRequired) {
    return persistCheckoutSessionState(db, session, {
      status: "pending_confirming",
      paidSats: session.asset === "btc" ? Number(paidAtomic) : null,
      paidAmountAtomic: candidate.paidAmountAtomic,
      txId: candidate.txId,
      confirmations: candidate.confirmations,
      lastCheckedAt: nowIso,
      confirmedAt: null,
      paidUntil: null,
      reason: null,
    });
  }

  const claimKey = `${session.network_key}:${candidate.txId}`;
  const claimResult = await claimBillingTransaction(db, claimKey, userId);
  if (claimResult === "already_claimed_by_other_user") {
    return persistCheckoutSessionState(db, session, {
      status: "reorg_review",
      paidSats: session.asset === "btc" ? Number(paidAtomic) : null,
      paidAmountAtomic: candidate.paidAmountAtomic,
      txId: candidate.txId,
      confirmations: candidate.confirmations,
      lastCheckedAt: nowIso,
      confirmedAt: null,
      paidUntil: null,
      reason: "Transaction already used by another account",
    });
  }

  let paidUntil: string | null = null;
  if (claimResult === "already_claimed_by_current_user") {
    const refreshedUser = await getUserById(db, userId);
    if (
      refreshedUser?.plan_expires_day !== null &&
      refreshedUser?.plan_expires_day !== undefined
    ) {
      paidUntil = dayNumberToIso(refreshedUser.plan_expires_day);
    }
  } else {
    const refreshedUser = await getUserById(db, userId);
    const currentDay = getCurrentDayNumber();
    const baseDay = Math.max(currentDay, refreshedUser?.plan_expires_day ?? currentDay);
    const planExpiresDay = baseDay + session.subscription_days;
    try {
      await setUserPlan(db, userId, "pro", planExpiresDay);
    } catch (error) {
      await releaseBillingTransactionClaim(db, claimKey, userId);
      throw error;
    }
    paidUntil = dayNumberToIso(planExpiresDay);
  }

  return persistCheckoutSessionState(db, session, {
    status: "confirmed",
    paidSats: session.asset === "btc" ? Number(paidAtomic) : null,
    paidAmountAtomic: candidate.paidAmountAtomic,
    txId: candidate.txId,
    confirmations: candidate.confirmations,
    lastCheckedAt: nowIso,
    confirmedAt: nowIso,
    paidUntil,
    reason: null,
  });
}

async function resolveCheckoutForRail(
  address: string,
  rail: CheckoutRail,
): Promise<CheckoutResolution> {
  if (rail.railType === "btc") {
    return resolveCheckoutByAddress(
      address,
      rail.btcNetwork || "mainnet",
      rail.confirmationsRequired,
    );
  }
  if (rail.railType === "sol_native") {
    return resolveSolanaNativeCheckout(address, rail);
  }
  if (!rail.explorerApiBase || !rail.explorerSource) {
    return {
      kind: "verification_delayed",
      reason: "Explorer API is not configured for this network",
    };
  }
  if (rail.railType === "evm_native") {
    return resolveEvmNativeCheckout(address, rail);
  }
  return resolveEvmTokenCheckout(address, rail);
}

async function resolveEvmNativeCheckout(
  address: string,
  rail: CheckoutRail,
): Promise<CheckoutResolution> {
  const lookup = await fetchEvmExplorerResult<EvmExplorerTx>(rail, {
    module: "account",
    action: "txlist",
    address,
    sort: "desc",
    page: "1",
    offset: "60",
  });
  if (lookup.kind === "unavailable") {
    return { kind: "verification_delayed", reason: `${lookup.source}: ${lookup.error}` };
  }

  const candidate = pickBestEvmNativeCandidate(lookup.rows, address);
  if (!candidate) return { kind: "not_found" };
  return {
    kind: "success",
    source: lookup.source,
    candidate,
    requiresReorgReview: false,
  };
}

async function resolveEvmTokenCheckout(
  address: string,
  rail: CheckoutRail,
): Promise<CheckoutResolution> {
  if (!rail.tokenContract) {
    return {
      kind: "verification_delayed",
      reason: "Token contract is not configured",
    };
  }
  const lookup = await fetchEvmExplorerResult<EvmExplorerTokenTx>(rail, {
    module: "account",
    action: "tokentx",
    address,
    contractaddress: rail.tokenContract,
    sort: "desc",
    page: "1",
    offset: "60",
  });
  if (lookup.kind === "unavailable") {
    return { kind: "verification_delayed", reason: `${lookup.source}: ${lookup.error}` };
  }
  const candidate = pickBestEvmTokenCandidate(lookup.rows, address, rail.tokenContract);
  if (!candidate) return { kind: "not_found" };
  return {
    kind: "success",
    source: lookup.source,
    candidate,
    requiresReorgReview: false,
  };
}

async function resolveSolanaNativeCheckout(
  address: string,
  rail: CheckoutRail,
): Promise<CheckoutResolution> {
  const rpcUrl = (rail.solanaRpcUrl || "").trim();
  if (!rpcUrl) {
    return {
      kind: "verification_delayed",
      reason: "Solana RPC endpoint is not configured",
    };
  }

  const signaturesLookup = await fetchSolanaSignatures(rpcUrl, address, 30);
  if (signaturesLookup.kind === "unavailable") {
    return {
      kind: "verification_delayed",
      reason: `${signaturesLookup.source}: ${signaturesLookup.error}`,
    };
  }
  if (signaturesLookup.signatures.length === 0) {
    return { kind: "not_found" };
  }

  const tipSlotLookup = await fetchSolanaTipSlot(rpcUrl);
  const txLookups = await Promise.all(
    signaturesLookup.signatures.map((signature) =>
      fetchSolanaTransaction(rpcUrl, signature.signature || ""),
    ),
  );

  let best: CheckoutCandidate | null = null;
  let hadUnavailableTxLookup = false;

  signaturesLookup.signatures.forEach((signature, index) => {
    const txLookup = txLookups[index];
    if (!txLookup) return;
    if (txLookup.kind === "unavailable") {
      hadUnavailableTxLookup = true;
      return;
    }
    if (!txLookup.tx) return;
    const paidLamports = getSolanaReceivedLamports(txLookup.tx, address);
    if (paidLamports <= 0n) return;
    const signatureValue = String(signature.signature || "").trim();
    if (!signatureValue) return;

    const confirmations = getSolanaConfirmationCount(
      signature.slot ?? txLookup.tx.slot,
      tipSlotLookup.kind === "success" ? tipSlotLookup.tipSlot : null,
      signature.confirmationStatus,
      rail.confirmationsRequired,
    );
    const candidate: CheckoutCandidate = {
      txId: signatureValue,
      paidAmountAtomic: paidLamports.toString(),
      confirmations,
    };
    if (!best) {
      best = candidate;
      return;
    }
    if (candidate.confirmations > best.confirmations) {
      best = candidate;
      return;
    }
    if (
      candidate.confirmations === best.confirmations &&
      safeBigInt(candidate.paidAmountAtomic) > safeBigInt(best.paidAmountAtomic)
    ) {
      best = candidate;
    }
  });

  if (best) {
    return {
      kind: "success",
      source: "solana_rpc",
      candidate: best,
      requiresReorgReview: false,
    };
  }

  if (hadUnavailableTxLookup) {
    return {
      kind: "verification_delayed",
      reason: "solana_rpc: Unable to fetch transaction details",
    };
  }
  return { kind: "not_found" };
}

function getSolanaReceivedLamports(
  tx: SolanaTransactionPayload,
  address: string,
): bigint {
  if (tx.meta?.err) return 0n;
  const accountKeysRaw = tx.transaction?.message?.accountKeys;
  if (!Array.isArray(accountKeysRaw)) return 0n;
  const accountKeys = accountKeysRaw.map((key) => {
    if (typeof key === "string") return key;
    return typeof key?.pubkey === "string" ? key.pubkey : "";
  });
  const targetIndex = accountKeys.findIndex((key) => key === address);
  if (targetIndex < 0) return 0n;
  const preBalances = tx.meta?.preBalances;
  const postBalances = tx.meta?.postBalances;
  if (!Array.isArray(preBalances) || !Array.isArray(postBalances)) return 0n;
  const pre = preBalances[targetIndex];
  const post = postBalances[targetIndex];
  if (!Number.isFinite(pre) || !Number.isFinite(post)) return 0n;
  const delta = Math.floor(post - pre);
  if (delta <= 0) return 0n;
  return BigInt(delta);
}

function getSolanaConfirmationCount(
  txSlot: number | undefined,
  tipSlot: number | null,
  confirmationStatus: SolanaSignatureInfo["confirmationStatus"],
  requiredConfirmations: number,
): number {
  if (
    typeof txSlot === "number" &&
    Number.isFinite(txSlot) &&
    typeof tipSlot === "number" &&
    Number.isFinite(tipSlot) &&
    tipSlot >= txSlot
  ) {
    return Math.max(1, tipSlot - txSlot + 1);
  }
  if (confirmationStatus === "finalized") {
    return Math.max(requiredConfirmations, 32);
  }
  if (confirmationStatus === "confirmed") {
    return 1;
  }
  return 0;
}

async function fetchSolanaSignatures(
  rpcUrl: string,
  address: string,
  limit: number,
): Promise<
  | { kind: "success"; source: SolSource; signatures: SolanaSignatureInfo[] }
  | { kind: "unavailable"; source: SolSource; error: string }
> {
  const response = await fetchSolanaRpc<{ result?: unknown; error?: { message?: string } }>(
    rpcUrl,
    "getSignaturesForAddress",
    [address, { limit: Math.max(1, Math.min(100, limit)), commitment: "confirmed" }],
  );
  if (response.kind === "unavailable") {
    return response;
  }

  const result = response.body.result;
  if (!Array.isArray(result)) {
    return {
      kind: "success",
      source: "solana_rpc",
      signatures: [],
    };
  }
  return {
    kind: "success",
    source: "solana_rpc",
    signatures: result as SolanaSignatureInfo[],
  };
}

async function fetchSolanaTipSlot(
  rpcUrl: string,
): Promise<
  | { kind: "success"; source: SolSource; tipSlot: number | null }
  | { kind: "unavailable"; source: SolSource; error: string }
> {
  const response = await fetchSolanaRpc<{ result?: unknown; error?: { message?: string } }>(
    rpcUrl,
    "getSlot",
    [{ commitment: "confirmed" }],
  );
  if (response.kind === "unavailable") {
    return response;
  }
  const tipSlot = Number(response.body.result);
  return {
    kind: "success",
    source: "solana_rpc",
    tipSlot: Number.isFinite(tipSlot) && tipSlot > 0 ? Math.floor(tipSlot) : null,
  };
}

async function fetchSolanaTransaction(
  rpcUrl: string,
  signature: string,
): Promise<
  | { kind: "success"; source: SolSource; tx: SolanaTransactionPayload | null }
  | { kind: "unavailable"; source: SolSource; error: string }
> {
  const normalized = signature.trim();
  if (!normalized) {
    return {
      kind: "success",
      source: "solana_rpc",
      tx: null,
    };
  }
  const response = await fetchSolanaRpc<{ result?: unknown; error?: { message?: string } }>(
    rpcUrl,
    "getTransaction",
    [
      normalized,
      {
        encoding: "jsonParsed",
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      },
    ],
  );
  if (response.kind === "unavailable") {
    return response;
  }
  const tx = response.body.result;
  if (!tx || typeof tx !== "object") {
    return {
      kind: "success",
      source: "solana_rpc",
      tx: null,
    };
  }
  return {
    kind: "success",
    source: "solana_rpc",
    tx: tx as SolanaTransactionPayload,
  };
}

async function fetchSolanaRpc<T extends { error?: { message?: string } }>(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<
  | { kind: "success"; source: SolSource; body: T }
  | { kind: "unavailable"; source: SolSource; error: string }
> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BILLING_VERIFY_TIMEOUT_MS);
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `${method}-${Date.now()}`,
        method,
        params,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        kind: "unavailable",
        source: "solana_rpc",
        error: `HTTP ${response.status}`,
      };
    }
    const body = (await response.json()) as T;
    if (body.error?.message) {
      return {
        kind: "unavailable",
        source: "solana_rpc",
        error: body.error.message,
      };
    }
    return {
      kind: "success",
      source: "solana_rpc",
      body,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        kind: "unavailable",
        source: "solana_rpc",
        error: "timeout",
      };
    }
    return {
      kind: "unavailable",
      source: "solana_rpc",
      error: error instanceof Error ? error.message : "network_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function pickBestEvmNativeCandidate(
  rows: EvmExplorerTx[],
  address: string,
): CheckoutCandidate | null {
  const receiver = address.trim().toLowerCase();
  let best: CheckoutCandidate | null = null;
  for (const row of rows) {
    const txId = (row.hash || "").trim().toLowerCase();
    if (!/^0x[a-f0-9]{64}$/.test(txId)) continue;
    const toAddress = (row.to || "").trim().toLowerCase();
    if (toAddress !== receiver) continue;
    if (row.isError === "1" || row.txreceipt_status === "0") continue;
    const value = (row.value || "").trim();
    if (!/^[0-9]+$/.test(value)) continue;
    const paidAtomic = safeBigInt(value);
    if (paidAtomic <= 0n) continue;
    const confirmations = Number.parseInt(row.confirmations || "0", 10);
    const candidate: CheckoutCandidate = {
      txId,
      paidAmountAtomic: paidAtomic.toString(),
      confirmations: Number.isFinite(confirmations) ? Math.max(0, confirmations) : 0,
    };
    if (!best) {
      best = candidate;
      continue;
    }
    if (candidate.confirmations > best.confirmations) {
      best = candidate;
      continue;
    }
    if (
      candidate.confirmations === best.confirmations &&
      safeBigInt(candidate.paidAmountAtomic) > safeBigInt(best.paidAmountAtomic)
    ) {
      best = candidate;
    }
  }
  return best;
}

function pickBestEvmTokenCandidate(
  rows: EvmExplorerTokenTx[],
  address: string,
  contractAddress: string,
): CheckoutCandidate | null {
  const receiver = address.trim().toLowerCase();
  const contract = contractAddress.trim().toLowerCase();
  let best: CheckoutCandidate | null = null;
  for (const row of rows) {
    const txId = (row.hash || "").trim().toLowerCase();
    if (!/^0x[a-f0-9]{64}$/.test(txId)) continue;
    const toAddress = (row.to || "").trim().toLowerCase();
    if (toAddress !== receiver) continue;
    const txContract = (row.contractAddress || "").trim().toLowerCase();
    if (!txContract || txContract !== contract) continue;
    if (row.isError === "1" || row.txreceipt_status === "0") continue;
    const value = (row.value || "").trim();
    if (!/^[0-9]+$/.test(value)) continue;
    const paidAtomic = safeBigInt(value);
    if (paidAtomic <= 0n) continue;
    const confirmations = Number.parseInt(row.confirmations || "0", 10);
    const candidate: CheckoutCandidate = {
      txId,
      paidAmountAtomic: paidAtomic.toString(),
      confirmations: Number.isFinite(confirmations) ? Math.max(0, confirmations) : 0,
    };
    if (!best) {
      best = candidate;
      continue;
    }
    if (candidate.confirmations > best.confirmations) {
      best = candidate;
      continue;
    }
    if (
      candidate.confirmations === best.confirmations &&
      safeBigInt(candidate.paidAmountAtomic) > safeBigInt(best.paidAmountAtomic)
    ) {
      best = candidate;
    }
  }
  return best;
}

async function fetchEvmExplorerResult<T extends EvmExplorerTx>(
  rail: CheckoutRail,
  params: Record<string, string>,
): Promise<
  | { kind: "success"; source: EvmSource; rows: T[] }
  | { kind: "unavailable"; source: EvmSource; error: string }
> {
  const query = new URLSearchParams(params);
  if (rail.explorerApiKey) {
    query.set("apikey", rail.explorerApiKey);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BILLING_VERIFY_TIMEOUT_MS);
  try {
    const response = await fetch(`${rail.explorerApiBase}?${query.toString()}`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        kind: "unavailable",
        source: rail.explorerSource as EvmSource,
        error: `HTTP ${response.status}`,
      };
    }
    const body = (await response.json()) as {
      status?: string;
      message?: string;
      result?: unknown;
    };
    if (Array.isArray(body.result)) {
      return {
        kind: "success",
        source: rail.explorerSource as EvmSource,
        rows: body.result as T[],
      };
    }
    const message = String(body.message || "");
    const resultText = String(body.result || "");
    const noTx =
      message.toLowerCase().includes("no transactions") ||
      resultText.toLowerCase().includes("no transactions");
    if (noTx || body.status === "0") {
      return {
        kind: "success",
        source: rail.explorerSource as EvmSource,
        rows: [],
      };
    }
    return {
      kind: "unavailable",
      source: rail.explorerSource as EvmSource,
      error: message || "Explorer response invalid",
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        kind: "unavailable",
        source: rail.explorerSource as EvmSource,
        error: "timeout",
      };
    }
    return {
      kind: "unavailable",
      source: rail.explorerSource as EvmSource,
      error: error instanceof Error ? error.message : "network_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function getBnbUsdRate(): Promise<number> {
  const now = Date.now();
  if (bnbUsdRateCache && now - bnbUsdRateCache.fetchedAt < PRICE_RATE_CACHE_TTL_MS) {
    return bnbUsdRateCache.value;
  }
  const loaders: Array<() => Promise<number>> = [
    fetchBnbUsdFromCoinGecko,
    fetchBnbUsdFromBinance,
    fetchBnbUsdFromCoinPaprika,
    fetchBnbUsdFromCryptoCompare,
  ];
  for (const loader of loaders) {
    try {
      const value = await loader();
      if (!Number.isFinite(value) || value <= 0) continue;
      bnbUsdRateCache = {
        value,
        source: loader.name,
        fetchedAt: now,
      };
      return value;
    } catch {
      // Try next provider
    }
  }
  if (bnbUsdRateCache && now - bnbUsdRateCache.fetchedAt < PRICE_RATE_STALE_MS) {
    return bnbUsdRateCache.value;
  }
  throw new Error("Unable to fetch BNB/USD conversion rate");
}

async function fetchBnbUsdFromCoinGecko(): Promise<number> {
  const data = (await fetchJsonWithTimeout(
    "https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd",
  )) as { binancecoin?: { usd?: number } };
  return Number(data.binancecoin?.usd);
}

async function fetchBnbUsdFromBinance(): Promise<number> {
  const data = (await fetchJsonWithTimeout(
    "https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT",
  )) as { price?: string };
  return Number(data.price);
}

async function fetchBnbUsdFromCoinPaprika(): Promise<number> {
  const data = (await fetchJsonWithTimeout(
    "https://api.coinpaprika.com/v1/tickers/bnb-binance-coin",
  )) as { quotes?: { USD?: { price?: number } } };
  return Number(data.quotes?.USD?.price);
}

async function fetchBnbUsdFromCryptoCompare(): Promise<number> {
  const data = (await fetchJsonWithTimeout(
    "https://min-api.cryptocompare.com/data/price?fsym=BNB&tsyms=USD",
  )) as { USD?: number };
  return Number(data.USD);
}

async function getEthUsdRate(): Promise<number> {
  const now = Date.now();
  if (ethUsdRateCache && now - ethUsdRateCache.fetchedAt < PRICE_RATE_CACHE_TTL_MS) {
    return ethUsdRateCache.value;
  }
  const loaders: Array<() => Promise<number>> = [
    fetchEthUsdFromCoinGecko,
    fetchEthUsdFromBinance,
    fetchEthUsdFromCoinPaprika,
    fetchEthUsdFromCryptoCompare,
  ];
  for (const loader of loaders) {
    try {
      const value = await loader();
      if (!Number.isFinite(value) || value <= 0) continue;
      ethUsdRateCache = {
        value,
        source: loader.name,
        fetchedAt: now,
      };
      return value;
    } catch {
      // Try next provider
    }
  }
  if (ethUsdRateCache && now - ethUsdRateCache.fetchedAt < PRICE_RATE_STALE_MS) {
    return ethUsdRateCache.value;
  }
  throw new Error("Unable to fetch ETH/USD conversion rate");
}

async function fetchEthUsdFromCoinGecko(): Promise<number> {
  const data = (await fetchJsonWithTimeout(
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
  )) as { ethereum?: { usd?: number } };
  return Number(data.ethereum?.usd);
}

async function fetchEthUsdFromBinance(): Promise<number> {
  const data = (await fetchJsonWithTimeout(
    "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT",
  )) as { price?: string };
  return Number(data.price);
}

async function fetchEthUsdFromCoinPaprika(): Promise<number> {
  const data = (await fetchJsonWithTimeout(
    "https://api.coinpaprika.com/v1/tickers/eth-ethereum",
  )) as { quotes?: { USD?: { price?: number } } };
  return Number(data.quotes?.USD?.price);
}

async function fetchEthUsdFromCryptoCompare(): Promise<number> {
  const data = (await fetchJsonWithTimeout(
    "https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD",
  )) as { USD?: number };
  return Number(data.USD);
}

async function getSolUsdRate(): Promise<number> {
  const now = Date.now();
  if (solUsdRateCache && now - solUsdRateCache.fetchedAt < PRICE_RATE_CACHE_TTL_MS) {
    return solUsdRateCache.value;
  }
  const loaders: Array<() => Promise<number>> = [
    fetchSolUsdFromCoinGecko,
    fetchSolUsdFromBinance,
    fetchSolUsdFromCoinPaprika,
    fetchSolUsdFromCryptoCompare,
  ];
  for (const loader of loaders) {
    try {
      const value = await loader();
      if (!Number.isFinite(value) || value <= 0) continue;
      solUsdRateCache = {
        value,
        source: loader.name,
        fetchedAt: now,
      };
      return value;
    } catch {
      // Try next provider
    }
  }
  if (solUsdRateCache && now - solUsdRateCache.fetchedAt < PRICE_RATE_STALE_MS) {
    return solUsdRateCache.value;
  }
  throw new Error("Unable to fetch SOL/USD conversion rate");
}

async function fetchSolUsdFromCoinGecko(): Promise<number> {
  const data = (await fetchJsonWithTimeout(
    "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
  )) as { solana?: { usd?: number } };
  return Number(data.solana?.usd);
}

async function fetchSolUsdFromBinance(): Promise<number> {
  const data = (await fetchJsonWithTimeout(
    "https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT",
  )) as { price?: string };
  return Number(data.price);
}

async function fetchSolUsdFromCoinPaprika(): Promise<number> {
  const data = (await fetchJsonWithTimeout(
    "https://api.coinpaprika.com/v1/tickers/sol-solana",
  )) as { quotes?: { USD?: { price?: number } } };
  return Number(data.quotes?.USD?.price);
}

async function fetchSolUsdFromCryptoCompare(): Promise<number> {
  const data = (await fetchJsonWithTimeout(
    "https://min-api.cryptocompare.com/data/price?fsym=SOL&tsyms=USD",
  )) as { USD?: number };
  return Number(data.USD);
}

async function fetchJsonWithTimeout(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BILLING_VERIFY_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveCheckoutByAddress(
  address: string,
  network: "mainnet" | "testnet",
  requiredConfirmations: number,
): Promise<CheckoutResolution> {
  const [primary, secondary] = await Promise.all([
    fetchAddressTransactionsFromSource("blockstream", address, network),
    fetchAddressTransactionsFromSource("mempool", address, network),
  ]);

  const primaryTipPromise =
    primary.kind === "success" ? fetchTipHeightFromSource(primary.source, network) : null;
  const secondaryTipPromise =
    secondary.kind === "success" ? fetchTipHeightFromSource(secondary.source, network) : null;
  const [primaryTip, secondaryTip] = await Promise.all([
    primaryTipPromise ?? Promise.resolve(null),
    secondaryTipPromise ?? Promise.resolve(null),
  ]);

  const primaryCandidate =
    primary.kind === "success"
      ? pickBestCheckoutCandidate(
          primary.txs,
          address,
          primaryTip,
          requiredConfirmations,
        )
      : null;
  const secondaryCandidate =
    secondary.kind === "success"
      ? pickBestCheckoutCandidate(
          secondary.txs,
          address,
          secondaryTip,
          requiredConfirmations,
        )
      : null;

  if (primaryCandidate) {
    return {
      kind: "success",
      source: "blockstream",
      candidate: primaryCandidate,
      requiresReorgReview:
        Boolean(
          secondaryCandidate &&
            secondaryCandidate.txId === primaryCandidate.txId &&
            secondaryCandidate.confirmations !== primaryCandidate.confirmations,
        ),
    };
  }
  if (secondaryCandidate) {
    return {
      kind: "success",
      source: "mempool",
      candidate: secondaryCandidate,
      requiresReorgReview: false,
    };
  }

  if (primary.kind === "success" || secondary.kind === "success") {
    return { kind: "not_found" };
  }

  const reasons = [primary, secondary]
    .filter(
      (item): item is Extract<AddressLookupResult, { kind: "unavailable" }> =>
        item.kind === "unavailable",
    )
    .map((item) => `${item.source}: ${item.error}`);

  return {
    kind: "verification_delayed",
    reason: reasons.join("; ") || "Unable to verify transaction right now",
  };
}

function pickBestCheckoutCandidate(
  txs: AddressTxPayload[],
  address: string,
  tipHeight: number | null,
  requiredConfirmations: number,
): CheckoutCandidate | null {
  let best: CheckoutCandidate | null = null;

  for (const tx of txs) {
    const txId = typeof tx.txid === "string" ? tx.txid.trim().toLowerCase() : "";
    if (!TX_ID_REGEX.test(txId)) continue;
    const paidSats = sumAddressOutputs(tx, address);
    if (paidSats <= 0) continue;

    const confirmed = Boolean(tx.status?.confirmed);
    const confirmations = getConfirmationCount(
      confirmed,
      tx.status?.block_height,
      tipHeight,
      requiredConfirmations,
    );

    const candidate: CheckoutCandidate = {
      txId,
      paidAmountAtomic: String(paidSats),
      confirmations,
    };
    if (!best) {
      best = candidate;
      continue;
    }
    if (candidate.confirmations > best.confirmations) {
      best = candidate;
      continue;
    }
    if (
      candidate.confirmations === best.confirmations &&
      safeBigInt(candidate.paidAmountAtomic) > safeBigInt(best.paidAmountAtomic)
    ) {
      best = candidate;
    }
  }

  return best;
}

function sumAddressOutputs(tx: TxPayload | AddressTxPayload, address: string): number {
  const outputs = Array.isArray(tx.vout) ? tx.vout : [];
  return outputs.reduce((sum, output) => {
    if (output.scriptpubkey_address !== address) return sum;
    if (typeof output.value !== "number" || !Number.isFinite(output.value)) {
      return sum;
    }
    const normalizedValue = Math.floor(output.value);
    if (normalizedValue <= 0) return sum;
    return sum + normalizedValue;
  }, 0);
}

function getConfirmationCount(
  confirmed: boolean,
  blockHeight: number | undefined,
  tipHeight: number | null,
  requiredConfirmations: number,
): number {
  if (!confirmed) return 0;
  if (
    typeof blockHeight === "number" &&
    Number.isFinite(blockHeight) &&
    typeof tipHeight === "number" &&
    Number.isFinite(tipHeight) &&
    tipHeight >= blockHeight
  ) {
    return Math.max(1, tipHeight - blockHeight + 1);
  }
  return Math.max(1, requiredConfirmations);
}

async function fetchAddressTransactionsFromSource(
  source: TxSource,
  address: string,
  network: "mainnet" | "testnet",
): Promise<AddressLookupResult> {
  const baseUrl =
    source === "blockstream"
      ? getBlockstreamBaseUrl(network)
      : getMempoolBaseUrl(network);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BILLING_VERIFY_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/address/${address}/txs`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        kind: "unavailable",
        source,
        error: `HTTP ${response.status}`,
      };
    }

    const txs = (await response.json()) as AddressTxPayload[];
    return {
      kind: "success",
      source,
      txs: Array.isArray(txs) ? txs : [],
    };
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

async function fetchTipHeightFromSource(
  source: TxSource,
  network: "mainnet" | "testnet",
): Promise<number | null> {
  const baseUrl =
    source === "blockstream"
      ? getBlockstreamBaseUrl(network)
      : getMempoolBaseUrl(network);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BILLING_VERIFY_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/blocks/tip/height`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const raw = await response.text();
    const parsed = Number.parseInt(raw.trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  } catch {
    return null;
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
