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

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:8787";

const PROMO_COOKIE_NAME = "anglicus_promo";
const BILLING_CONFIG_TIMEOUT_MS = 12_000;

export type BillingFeature =
  | "tutor"
  | "lessonChat"
  | "quickChat"
  | "lessonExplanation"
  | "tutorQuestion"
  | "speaking";

type UsageKey = Exclude<keyof BillingUsage, "date">;

const FREE_LIMITS: Record<UsageKey, number> = {
  tutorMessages: 14,
  quickChatMessages: 8,
  lessonExplanations: 5,
  tutorQuestions: 3,
  speakingSessions: 6,
};

const NAG_PROBABILITY = 0.30;
const NAG_COOLDOWN_MS = 1000 * 60 * 5;

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

const EARLY_NAG_USAGE_THRESHOLD = 3;

function shouldNag(billing: BillingInfo, used: number): boolean {
  // Early nag on 3rd usage to encourage upgrade sooner
  if (used === EARLY_NAG_USAGE_THRESHOLD && !billing.lastPaywallShownAt) {
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

  if (shouldNag(billing, used)) {
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
