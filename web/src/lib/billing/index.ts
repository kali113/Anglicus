import { isBrowser } from "$lib/storage/base-store.js";
import { getSettings } from "$lib/storage/settings-store.js";
import { checkSuspiciousActivity } from "$lib/storage/secure-store.js";
import { getToken, refreshToken, setToken } from "$lib/auth/index.js";
import { trackEvent } from "$lib/analytics/index.js";
import { getTodayKey } from "$lib/utils/date.js";
import { get } from "svelte/store";
import { t } from "$lib/i18n";
import {
  getDefaultBilling,
  getUserProfile,
  updateUserProfile,
} from "$lib/storage/user-store.js";
import type { BillingInfo, BillingUsage } from "$lib/types/user.js";
import {
  PROMO_CODE_DISCOUNT_PERCENT,
} from "$lib/billing/promo-codes.js";
import { BACKEND_URL } from "$lib/config/backend-url.js";

const PROMO_COOKIE_NAME = "anglicus_promo";
const BILLING_CONFIG_TIMEOUT_MS = 12_000;
const ACTIVE_CHECKOUT_SESSION_KEY = "anglicus_active_checkout_session_id_v1";

export type BillingFeature =
  | "tutor"
  | "lessonChat"
  | "quickChat"
  | "lessonExplanation"
  | "tutorQuestion"
  | "speaking";

type UsageKey = Exclude<keyof BillingUsage, "date">;

const FREE_LIMITS: Record<UsageKey, number> = {
  tutorMessages: 20,
  quickChatMessages: 12,
  lessonExplanations: 8,
  tutorQuestions: 5,
  speakingSessions: 10,
};

const NAG_PROBABILITY = 0.30;
const NAG_COOLDOWN_MS = 1000 * 60 * 5;
const NAG_START_RATIO = 0.60;
const MIN_USAGE_BEFORE_NAG = 5;

const FEATURE_USAGE_MAP: Record<BillingFeature, UsageKey> = {
  tutor: "tutorMessages",
  lessonChat: "tutorMessages",
  quickChat: "quickChatMessages",
  lessonExplanation: "lessonExplanations",
  tutorQuestion: "tutorQuestions",
  speaking: "speakingSessions",
};

export type BillingDecision = {
  allow: boolean;
  mode: "allow" | "nag" | "block";
  reason: "ok" | "nag" | "limit";
  used: number;
  limit: number;
  billing: BillingInfo;
};

export type PromoValidationResult = {
  valid: boolean;
  reason?: "invalid" | "used";
  codeHash?: string;
  discountPercent?: number;
};

export type ReferralValidationResult = {
  valid: boolean;
  reason?: "invalid";
  codeHash?: string;
  discountPercent?: number;
};

export type BillingPaymentConfig = {
  address: string;
  network: "mainnet" | "testnet";
  minSats: number;
  subscriptionDays: number;
  priceUsd?: number;
  discountPercent?: number;
  discountSource?: "promo" | "referral";
  checkoutRails?: BillingCheckoutRailOption[];
};

export type BillingPaymentResult = {
  status:
    | "pending_unconfirmed"
    | "pending_confirming"
    | "confirmed"
    | "verification_delayed"
    | "reorg_review";
  paidUntil?: string;
  paidSats: number;
  requiredSats: number;
  source?: "blockstream" | "mempool";
  reason?: string;
};

export type BillingServerStatus = {
  planType: "free" | "pro";
  planExpiresDay: number | null;
  isActive: boolean;
  effectivePlanType: "free" | "pro";
  paidUntil?: string;
};

export type BillingCheckoutStatus =
  | "awaiting_payment"
  | "pending_confirming"
  | "confirmed"
  | "underpaid"
  | "expired"
  | "verification_delayed"
  | "reorg_review";

export type CheckoutAsset = "btc" | "bnb" | "eth" | "sol" | "usdt";
export type CheckoutNetwork =
  | "bitcoin"
  | "bsc"
  | "ethereum"
  | "polygon"
  | "arbitrum"
  | "solana";

export type BillingCheckoutRailOption = {
  asset: CheckoutAsset;
  network: CheckoutNetwork;
  symbol: string;
  label: string;
};

export type BillingCheckoutSession = {
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

export type BillingCheckoutStatusResult = {
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

export type CheckoutSelection = {
  asset?: CheckoutAsset;
  network?: CheckoutNetwork;
};

export function getFeatureLabel(feature: BillingFeature): string {
  const translate = get(t);
  return translate(`billing.features.${feature}`);
}

export function isByokFree(): boolean {
  const settings = getSettings();
  return settings.apiConfig.tier === "byok";
}

function normalizeBilling(billing: BillingInfo): { billing: BillingInfo; changed: boolean } {
  const today = getTodayKey();
  let changed = false;
  let updated = billing;

  if (updated.usage.date !== today) {
    updated = {
      ...updated,
      usage: {
        date: today,
        tutorMessages: 0,
        quickChatMessages: 0,
        lessonExplanations: 0,
        tutorQuestions: 0,
        speakingSessions: 0,
      },
    };
    changed = true;
  }

  if (updated.status === "active" && updated.paidUntil) {
    const expiresAt = new Date(updated.paidUntil).getTime();
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      updated = {
        ...updated,
        status: "expired",
        plan: "free",
      };
      changed = true;
    }
  }

  if (!Array.isArray(updated.redeemedCodeHashes)) {
    updated = { ...updated, redeemedCodeHashes: [] };
    changed = true;
  }

  if (updated.referralCodeHash) {
    const referralPercent = updated.discountPercent ?? 25;
    if (
      updated.discountSource !== "referral" ||
      updated.discountPercent !== referralPercent ||
      updated.promoCodeHash
    ) {
      updated = {
        ...updated,
        discountSource: "referral",
        discountPercent: referralPercent,
        promoCodeHash: undefined,
      };
      changed = true;
    }
  } else if (updated.promoCodeHash) {
    if (
      updated.discountSource !== "promo" ||
      updated.discountPercent !== PROMO_CODE_DISCOUNT_PERCENT
    ) {
      updated = {
        ...updated,
        discountSource: "promo",
        discountPercent: PROMO_CODE_DISCOUNT_PERCENT,
      };
      changed = true;
    }
  } else if (updated.discountPercent || updated.discountSource) {
    updated = {
      ...updated,
      discountPercent: undefined,
      discountSource: undefined,
    };
    changed = true;
  }

  return { billing: updated, changed };
}

async function getBillingSnapshot(): Promise<{ billing: BillingInfo } | null> {
  const profile = await getUserProfile();
  if (!profile) return null;

  const defaults = getDefaultBilling();
  const merged: BillingInfo = {
    ...defaults,
    ...profile.billing,
    usage: {
      ...defaults.usage,
      ...profile.billing.usage,
    },
    redeemedCodeHashes:
      profile.billing.redeemedCodeHashes || defaults.redeemedCodeHashes,
  };

  const { billing, changed } = normalizeBilling(merged);
  if (changed) {
    await updateUserProfile({ billing });
  }

  return { billing };
}

function getNagStartUsage(limit: number): number {
  const ratioThreshold = Math.ceil(limit * NAG_START_RATIO);
  return Math.min(limit, Math.max(MIN_USAGE_BEFORE_NAG, ratioThreshold));
}

function shouldNag(billing: BillingInfo, used: number, limit: number): boolean {
  const nagStartUsage = getNagStartUsage(limit);
  if (used < nagStartUsage) {
    return false;
  }

  // First upsell appears only after meaningful free usage.
  if (used === nagStartUsage && !billing.lastPaywallShownAt) {
    return true;
  }

  if (!billing.lastPaywallShownAt) {
    return Math.random() < NAG_PROBABILITY;
  }

  const lastShown = new Date(billing.lastPaywallShownAt).getTime();
  if (Number.isFinite(lastShown) && Date.now() - lastShown < NAG_COOLDOWN_MS) {
    return false;
  }

  return Math.random() < NAG_PROBABILITY;
}

export async function checkBillingAccess(feature: BillingFeature): Promise<BillingDecision | null> {
  // Security check before allowing access
  const securityCheck = await checkSuspiciousActivity();
  if (securityCheck.action === "block") {
    console.warn("Access blocked:", securityCheck.reason);
    // Return a block decision with zeroed usage
    return {
      allow: false,
      mode: "block",
      reason: "limit",
      used: FREE_LIMITS[FEATURE_USAGE_MAP[feature]],
      limit: FREE_LIMITS[FEATURE_USAGE_MAP[feature]],
      billing: {
        ...getDefaultBilling(),
        status: "none",
        plan: "free",
      },
    };
  }
  
  const snapshot = await getBillingSnapshot();
  if (!snapshot) return null;

  if (isByokFree()) {
    return {
      allow: true,
      mode: "allow",
      reason: "ok",
      used: 0,
      limit: FREE_LIMITS[FEATURE_USAGE_MAP[feature]],
      billing: snapshot.billing,
    };
  }

  const billing = snapshot.billing;
  const usageKey = FEATURE_USAGE_MAP[feature];
  const used = billing.usage[usageKey];
  const limit = FREE_LIMITS[usageKey];

  if (billing.status === "active" && billing.plan === "pro") {
    return { allow: true, mode: "allow", reason: "ok", used, limit, billing };
  }

  if (used >= limit) {
    return { allow: false, mode: "block", reason: "limit", used, limit, billing };
  }

  if (shouldNag(billing, used, limit)) {
    return { allow: true, mode: "nag", reason: "nag", used, limit, billing };
  }

  return { allow: true, mode: "allow", reason: "ok", used, limit, billing };
}

export async function recordBillingUsage(feature: BillingFeature): Promise<void> {
  if (isByokFree()) return;
  
  // Security check before recording usage
  const securityCheck = await checkSuspiciousActivity();
  if (securityCheck.action === "block") {
    console.warn("Usage recording blocked:", securityCheck.reason);
    return;
  }
  
  const snapshot = await getBillingSnapshot();
  if (!snapshot) return;

  const billing = snapshot.billing;
  const usageKey = FEATURE_USAGE_MAP[feature];
  const previousUsage = billing.usage[usageKey];
  const updatedUsage = {
    ...billing.usage,
    [usageKey]: previousUsage + 1,
  };
  await updateUserProfile({ billing: { ...billing, usage: updatedUsage } });

  if (previousUsage === 0) {
    void trackEvent("activation_first_action", { feature });
  }
}

export async function markPaywallShown(): Promise<void> {
  const snapshot = await getBillingSnapshot();
  if (!snapshot) return;

  const billing = snapshot.billing;
  await updateUserProfile({
    billing: {
      ...billing,
      paywallImpressions: billing.paywallImpressions + 1,
      lastPaywallShownAt: new Date().toISOString(),
    },
  });
  void trackEvent("paywall_shown");
}

export async function getUsageInfo(feature: BillingFeature): Promise<{ used: number; limit: number; remaining: number; percentUsed: number } | null> {
  const snapshot = await getBillingSnapshot();
  if (!snapshot) return null;

  if (isByokFree()) {
    return { used: 0, limit: FREE_LIMITS[FEATURE_USAGE_MAP[feature]], remaining: Infinity, percentUsed: 0 };
  }

  const billing = snapshot.billing;
  if (billing.status === "active" && billing.plan === "pro") {
    return { used: 0, limit: Infinity, remaining: Infinity, percentUsed: 0 };
  }

  const usageKey = FEATURE_USAGE_MAP[feature];
  const used = billing.usage[usageKey];
  const limit = FREE_LIMITS[usageKey];
  const remaining = Math.max(0, limit - used);
  const percentUsed = Math.min(100, Math.round((used / limit) * 100));

  return { used, limit, remaining, percentUsed };
}

export async function validatePromoCode(
  rawCode: string,
  redeemedHashes: string[] = [],
): Promise<PromoValidationResult> {
  if (!isBrowser()) return { valid: false, reason: "invalid" };

  const normalized = normalizePromoCode(rawCode);
  if (!normalized) return { valid: false, reason: "invalid" };

  const response = await fetch(`${BACKEND_URL}/api/billing/promo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: normalized }),
  });
  if (!response.ok) {
    return { valid: false, reason: "invalid" };
  }

  const result = (await response.json()) as {
    valid?: boolean;
    reason?: "invalid";
    discountPercent?: number;
    promoToken?: string;
  };
  if (!result.valid || !result.promoToken) {
    return { valid: false, reason: result.reason || "invalid" };
  }

  const codeHash = result.promoToken;
  const alreadyUsed = redeemedHashes.includes(codeHash);
  if (alreadyUsed) return { valid: false, reason: "used" };

  return {
    valid: true,
    codeHash,
    discountPercent: result.discountPercent ?? PROMO_CODE_DISCOUNT_PERCENT,
  };
}

export async function applyPromoToBilling(
  billing: BillingInfo,
  promoHash: string,
): Promise<BillingInfo> {
  if (!isBrowser()) return billing;
  if (billing.referralCodeHash) {
    return {
      ...billing,
        discountSource: "referral",
      };
  }

  const redeemed = billing.redeemedCodeHashes.includes(promoHash)
    ? billing.redeemedCodeHashes
    : [...billing.redeemedCodeHashes, promoHash];

  return {
    ...billing,
    discountPercent: PROMO_CODE_DISCOUNT_PERCENT,
    discountSource: "promo",
    promoCodeHash: promoHash,
    referralCodeHash: undefined,
    redeemedCodeHashes: redeemed,
  };
}

export async function validateReferralCode(
  rawCode: string,
): Promise<ReferralValidationResult> {
  if (!isBrowser()) return { valid: false, reason: "invalid" };

  const normalized = normalizeReferralCode(rawCode);
  if (!normalized) return { valid: false, reason: "invalid" };

  const response = await fetch(`${BACKEND_URL}/api/billing/referral`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: normalized }),
  });

  if (!response.ok) {
    return { valid: false, reason: "invalid" };
  }

  const result = (await response.json()) as {
    valid?: boolean;
    reason?: "invalid";
    discountPercent?: number;
    referralToken?: string;
  };

  if (!result.valid || !result.referralToken) {
    return { valid: false, reason: result.reason || "invalid" };
  }

  return {
    valid: true,
    codeHash: result.referralToken,
    discountPercent: result.discountPercent,
  };
}

export async function applyReferralToBilling(
  billing: BillingInfo,
  referralHash: string,
  discountPercent: number,
): Promise<BillingInfo> {
  if (!isBrowser()) return billing;

  return {
    ...billing,
    discountPercent,
    discountSource: "referral",
    referralCodeHash: referralHash,
    promoCodeHash: undefined,
  };
}

export function getPromoToken(): string | null {
  if (!isBrowser()) return null;
  const cookies = document.cookie.split(";").map((value) => value.trim());
  const cookie = cookies.find((value) => value.startsWith(`${PROMO_COOKIE_NAME}=`));
  if (!cookie) return null;
  return cookie.split("=")[1] || null;
}

function getActiveCheckoutSessionId(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(ACTIVE_CHECKOUT_SESSION_KEY);
}

function setActiveCheckoutSessionId(sessionId: string | null): void {
  if (!isBrowser()) return;
  if (!sessionId) {
    localStorage.removeItem(ACTIVE_CHECKOUT_SESSION_KEY);
    return;
  }
  localStorage.setItem(ACTIVE_CHECKOUT_SESSION_KEY, sessionId);
}

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }
  if (typeof error === "object" && error !== null && "name" in error) {
    return (error as { name?: unknown }).name === "AbortError";
  }
  return false;
}

export async function getPaymentConfig(): Promise<BillingPaymentConfig> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BILLING_CONFIG_TIMEOUT_MS);

  try {
    const response = await fetch(`${BACKEND_URL}/api/billing/config`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error("No se pudo obtener la configuración de pago");
    }

    return (await response.json()) as BillingPaymentConfig;
  } catch (error) {
    if (isAbortLikeError(error)) {
      throw new Error("Payment config request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithAuthRetry(url: string, init: RequestInit): Promise<Response> {
  const token = getToken();
  if (!token) {
    throw new Error("No auth token");
  }

  const firstHeaders = new Headers(init.headers);
  firstHeaders.set("Authorization", `Bearer ${token}`);

  const firstResponse = await fetch(url, {
    ...init,
    headers: firstHeaders,
  });
  if (firstResponse.status !== 401) {
    return firstResponse;
  }

  const refreshed = await refreshToken();
  setToken(refreshed);

  const retryHeaders = new Headers(init.headers);
  retryHeaders.set("Authorization", `Bearer ${refreshed}`);
  return fetch(url, {
    ...init,
    headers: retryHeaders,
  });
}

function isPendingCheckoutStatus(status: BillingCheckoutStatus): boolean {
  return (
    status === "awaiting_payment" ||
    status === "pending_confirming" ||
    status === "underpaid" ||
    status === "verification_delayed" ||
    status === "reorg_review"
  );
}

async function applyCheckoutStatusToProfile(
  result: BillingCheckoutStatusResult,
): Promise<void> {
  const snapshot = await getBillingSnapshot();
  if (!snapshot) return;

  const now = new Date().toISOString();
  const billing: BillingInfo = {
    ...snapshot.billing,
    lastPaymentCheckedAt: now,
  };

  if (result.status === "confirmed") {
    billing.plan = "pro";
    billing.status = "active";
    billing.paidUntil = result.paidUntil;
    void trackEvent("payment_confirmed", {
      asset: result.asset,
      network: result.network,
      symbol: result.symbol,
      requiredAmountAtomic: result.requiredAmountAtomic,
      paidAmountAtomic: result.paidAmountAtomic ?? "0",
      source: "auto_checkout",
    });
  } else if (isPendingCheckoutStatus(result.status)) {
    billing.status = "pending";
  } else if (result.status === "expired" && billing.status !== "active") {
    billing.plan = "free";
    billing.status = "none";
    billing.paidUntil = undefined;
    void trackEvent("payment_expired", {
      asset: result.asset,
      network: result.network,
      requiredAmountAtomic: result.requiredAmountAtomic,
    });
  }

  await updateUserProfile({ billing });
}

function normalizeCheckoutAsset(value: unknown): CheckoutAsset {
  if (
    value === "btc" ||
    value === "bnb" ||
    value === "eth" ||
    value === "sol" ||
    value === "usdt"
  ) {
    return value;
  }
  return "btc";
}

function normalizeCheckoutNetwork(value: unknown): CheckoutNetwork {
  if (
    value === "bitcoin" ||
    value === "bsc" ||
    value === "ethereum" ||
    value === "polygon" ||
    value === "arbitrum" ||
    value === "solana"
  ) {
    return value;
  }
  if (value === "mainnet" || value === "testnet") return "bitcoin";
  return "bitcoin";
}

function normalizeAtomicString(value: unknown): string {
  if (typeof value === "string" && /^[0-9]+$/.test(value.trim())) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return String(Math.floor(value));
  }
  return "0";
}

function normalizeCheckoutSessionPayload(payload: unknown): BillingCheckoutSession {
  const raw = (payload ?? {}) as Record<string, unknown>;
  const asset = normalizeCheckoutAsset(raw.asset);
  const symbol =
    typeof raw.symbol === "string" && raw.symbol.trim().length > 0
      ? raw.symbol.trim()
      : asset === "btc"
        ? "sats"
        : asset === "eth"
          ? "ETH"
          : asset === "sol"
            ? "SOL"
        : asset === "usdt"
          ? "USDT"
          : "BNB";
  const requiredAmountAtomic = normalizeAtomicString(
    raw.requiredAmountAtomic ?? raw.requiredSats,
  );
  const requiredAmount =
    typeof raw.requiredAmount === "string" && raw.requiredAmount.trim().length > 0
      ? raw.requiredAmount.trim()
      : requiredAmountAtomic;
  return {
    sessionId: String(raw.sessionId ?? ""),
    address: String(raw.address ?? ""),
    asset,
    network: normalizeCheckoutNetwork(raw.network),
    symbol,
    requiredAmount,
    requiredAmountAtomic,
    subscriptionDays: Number(raw.subscriptionDays ?? 30),
    confirmationsRequired: Number(raw.confirmationsRequired ?? 1),
    tokenContract:
      typeof raw.tokenContract === "string" && raw.tokenContract.trim().length > 0
        ? raw.tokenContract.trim()
        : undefined,
    status: (raw.status as BillingCheckoutStatus) ?? "awaiting_payment",
    expiresAt: String(raw.expiresAt ?? new Date().toISOString()),
    disclaimer:
      typeof raw.disclaimer === "object" && raw.disclaimer !== null
        ? (raw.disclaimer as { en: string; es: string })
        : {
            en: "Crypto payments are irreversible.",
            es: "Los pagos en crypto son irreversibles.",
          },
  };
}

function normalizeCheckoutStatusPayload(payload: unknown): BillingCheckoutStatusResult {
  const raw = (payload ?? {}) as Record<string, unknown>;
  const asset = normalizeCheckoutAsset(raw.asset);
  const symbol =
    typeof raw.symbol === "string" && raw.symbol.trim().length > 0
      ? raw.symbol.trim()
      : asset === "btc"
        ? "sats"
        : asset === "eth"
          ? "ETH"
          : asset === "sol"
            ? "SOL"
        : asset === "usdt"
          ? "USDT"
          : "BNB";
  const requiredAmountAtomic = normalizeAtomicString(
    raw.requiredAmountAtomic ?? raw.requiredSats,
  );
  const paidAmountAtomic = normalizeAtomicString(raw.paidAmountAtomic ?? raw.paidSats);
  return {
    sessionId: String(raw.sessionId ?? ""),
    status: (raw.status as BillingCheckoutStatus) ?? "awaiting_payment",
    asset,
    network: normalizeCheckoutNetwork(raw.network),
    symbol,
    requiredAmount:
      typeof raw.requiredAmount === "string" && raw.requiredAmount.trim().length > 0
        ? raw.requiredAmount.trim()
        : requiredAmountAtomic,
    requiredAmountAtomic,
    paidAmount:
      typeof raw.paidAmount === "string" && raw.paidAmount.trim().length > 0
        ? raw.paidAmount.trim()
        : raw.paidAmountAtomic !== undefined || raw.paidSats !== undefined
          ? paidAmountAtomic
          : undefined,
    paidAmountAtomic:
      raw.paidAmountAtomic !== undefined || raw.paidSats !== undefined
        ? paidAmountAtomic
        : undefined,
    confirmations:
      typeof raw.confirmations === "number" && Number.isFinite(raw.confirmations)
        ? raw.confirmations
        : undefined,
    txHash:
      typeof raw.txHash === "string" && raw.txHash.trim().length > 0
        ? raw.txHash.trim()
        : undefined,
    paidUntil:
      typeof raw.paidUntil === "string" && raw.paidUntil.trim().length > 0
        ? raw.paidUntil.trim()
        : undefined,
    reason:
      typeof raw.reason === "string" && raw.reason.trim().length > 0
        ? raw.reason.trim()
        : undefined,
  };
}

function toCheckoutStatusResultFromSession(
  session: BillingCheckoutSession,
): BillingCheckoutStatusResult {
  return {
    sessionId: session.sessionId,
    status: session.status,
    asset: session.asset,
    network: session.network,
    symbol: session.symbol,
    requiredAmount: session.requiredAmount,
    requiredAmountAtomic: session.requiredAmountAtomic,
  };
}

function getCheckoutStatusErrorMessage(
  response: Response,
  payload: { error?: { message?: string } } | null,
): string {
  if (payload?.error?.message) return payload.error.message;
  if (response.status === 404) return "Checkout session not found";
  if (response.status === 401) return "Authentication required";
  return "Could not fetch checkout status";
}

export async function createCheckoutSession(
  selection: CheckoutSelection = {},
): Promise<BillingCheckoutSession> {
  const snapshot = await getBillingSnapshot();
  const promoToken = snapshot?.billing.promoCodeHash;
  const referralToken = snapshot?.billing.referralCodeHash;
  const body: Record<string, string> = {};
  if (promoToken) body.promoToken = promoToken;
  if (referralToken) body.referralToken = referralToken;
  if (selection.asset) body.asset = selection.asset;
  if (selection.network) body.network = selection.network;

  const response = await fetchWithAuthRetry(`${BACKEND_URL}/api/billing/checkout/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error?.message || "Could not create checkout session");
  }

  const payload = await response.json();
  const result = normalizeCheckoutSessionPayload(payload);
  setActiveCheckoutSessionId(result.sessionId);
  void trackEvent("payment_session_created", {
    sessionIdPrefix: result.sessionId.slice(0, 12),
    asset: result.asset,
    network: result.network,
    symbol: result.symbol,
    requiredAmountAtomic: result.requiredAmountAtomic,
  });
  if (isPendingCheckoutStatus(result.status)) {
    await applyCheckoutStatusToProfile(toCheckoutStatusResultFromSession(result));
  }
  return result;
}

export async function getCheckoutSessionStatus(
  sessionId: string,
): Promise<BillingCheckoutStatusResult> {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    throw new Error("sessionId is required");
  }

  const response = await fetchWithAuthRetry(
    `${BACKEND_URL}/api/billing/checkout/session/${encodeURIComponent(normalizedSessionId)}/status`,
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(getCheckoutStatusErrorMessage(response, error));
  }

  const payload = await response.json();
  const result = normalizeCheckoutStatusPayload(payload);
  await applyCheckoutStatusToProfile(result);

  if (result.status === "pending_confirming") {
    void trackEvent("payment_detected", {
      asset: result.asset,
      network: result.network,
      symbol: result.symbol,
      requiredAmountAtomic: result.requiredAmountAtomic,
      paidAmountAtomic: result.paidAmountAtomic ?? "0",
    });
  }
  if (result.status === "underpaid") {
    void trackEvent("payment_underpaid", {
      asset: result.asset,
      network: result.network,
      symbol: result.symbol,
      requiredAmountAtomic: result.requiredAmountAtomic,
      paidAmountAtomic: result.paidAmountAtomic ?? "0",
    });
  }

  if (result.status === "confirmed" || result.status === "expired") {
    setActiveCheckoutSessionId(null);
  } else {
    setActiveCheckoutSessionId(normalizedSessionId);
  }

  if (result.status === "confirmed") {
    await syncBillingFromServer().catch((error) => {
      console.error("Billing server sync failed:", error);
    });
  }

  return result;
}

export async function refreshActiveCheckoutSessionStatus(): Promise<void> {
  const sessionId = getActiveCheckoutSessionId();
  if (!sessionId) return;
  await getCheckoutSessionStatus(sessionId).catch((error) => {
    console.error("Checkout status sync failed:", error);
  });
}

export async function verifyPayment(txId: string): Promise<BillingPaymentResult> {
  const snapshot = await getBillingSnapshot();
  const promoToken = snapshot?.billing.promoCodeHash;
  const referralToken = snapshot?.billing.referralCodeHash;
  void trackEvent("payment_initiated", {
    txIdPrefix: txId.trim().slice(0, 12),
  });
  const response = await fetchWithAuthRetry(`${BACKEND_URL}/api/billing/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txId, promoToken, referralToken }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const message = error?.error?.message || "No se pudo verificar el pago";
    throw new Error(message);
  }

  const result = (await response.json()) as BillingPaymentResult;
  if (!snapshot) return result;

  const now = new Date().toISOString();
  const billing: BillingInfo = {
    ...snapshot.billing,
    lastPaymentTxId: txId,
    lastPaymentCheckedAt: now,
  };

  if (result.status === "confirmed") {
    billing.plan = "pro";
    billing.status = "active";
    billing.paidUntil = result.paidUntil;
    void trackEvent("payment_confirmed", {
      requiredSats: result.requiredSats,
      paidSats: result.paidSats,
      source: result.source || "unknown",
    });
  } else {
    billing.status = "pending";
  }

  await updateUserProfile({ billing });
  if (result.status === "confirmed") {
    await syncBillingFromServer().catch((error) => {
      console.error("Billing server sync failed:", error);
    });
  }
  return result;
}

export async function refreshPaymentStatus(): Promise<void> {
  await syncBillingFromServer().catch((error) => {
    console.error("Billing status sync failed:", error);
  });

  const snapshot = await getBillingSnapshot();
  if (!snapshot) return;

  const billing = snapshot.billing;
  if (!billing.lastPaymentTxId || billing.status !== "pending") return;

  await verifyPayment(billing.lastPaymentTxId);
}

export async function syncBillingFromServer(): Promise<void> {
  const token = getToken();
  if (!token) return;

  const snapshot = await getBillingSnapshot();
  if (!snapshot) return;

  const response = await fetchWithAuthRetry(`${BACKEND_URL}/api/billing/status`, {
    method: "GET",
  });
  if (!response.ok) return;

  const server = (await response.json()) as BillingServerStatus;
  const billing = snapshot.billing;
  const nextBilling: BillingInfo = { ...billing };

  if (server.effectivePlanType === "pro") {
    nextBilling.plan = "pro";
    nextBilling.status = "active";
    nextBilling.paidUntil = server.paidUntil;
  } else if (billing.status !== "pending") {
    nextBilling.plan = "free";
    nextBilling.status = billing.status === "active" ? "expired" : "none";
    nextBilling.paidUntil = undefined;
  }

  if (
    nextBilling.plan !== billing.plan ||
    nextBilling.status !== billing.status ||
    nextBilling.paidUntil !== billing.paidUntil
  ) {
    await updateUserProfile({ billing: nextBilling });
  }
}

function normalizePromoCode(rawCode: string): string | null {
  const cleaned = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(cleaned)) return null;
  return cleaned;
}

function normalizeReferralCode(rawCode: string): string | null {
  const cleaned = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6,16}$/.test(cleaned)) return null;
  return cleaned;
}
