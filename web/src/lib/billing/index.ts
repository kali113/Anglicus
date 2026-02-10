import { isBrowser } from "$lib/storage/base-store.js";
import { getSettings } from "$lib/storage/settings-store.js";
import {
  getDefaultBilling,
  getUserProfile,
  updateUserProfile,
} from "$lib/storage/user-store.js";
import type { BillingInfo, BillingUsage } from "$lib/types/user.js";
import {
  PROMO_CODE_DISCOUNT_PERCENT,
  PROMO_CODE_HASHES,
  PROMO_CODE_PEPPER,
} from "./promo-codes.js";

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:8787";

const PROMO_COOKIE_NAME = "anglicus_promo";
const PROMO_SALT_KEY = "anglicus_promo_salt";

export type BillingFeature =
  | "tutor"
  | "lessonChat"
  | "quickChat"
  | "lessonExplanation"
  | "tutorQuestion";

type UsageKey = Exclude<keyof BillingUsage, "date">;

const FREE_LIMITS: Record<UsageKey, number> = {
  tutorMessages: 18,
  quickChatMessages: 10,
  lessonExplanations: 6,
  tutorQuestions: 4,
};

const NAG_PROBABILITY = 0.18;
const NAG_COOLDOWN_MS = 1000 * 60 * 8;

const FEATURE_USAGE_MAP: Record<BillingFeature, UsageKey> = {
  tutor: "tutorMessages",
  lessonChat: "tutorMessages",
  quickChat: "quickChatMessages",
  lessonExplanation: "lessonExplanations",
  tutorQuestion: "tutorQuestions",
};

const FEATURE_LABELS: Record<BillingFeature, string> = {
  tutor: "Tutor IA",
  lessonChat: "Tutor en Lecciones",
  quickChat: "Chat Rápido",
  lessonExplanation: "Explicaciones",
  tutorQuestion: "Preguntar al tutor",
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

export type BillingPaymentConfig = {
  address: string;
  network: "mainnet" | "testnet";
  minSats: number;
  subscriptionDays: number;
  priceUsd?: number;
  discountPercent?: number;
};

export type BillingPaymentResult = {
  status: "pending" | "confirmed";
  paidUntil?: string;
  paidSats: number;
  requiredSats: number;
};

export function getFeatureLabel(feature: BillingFeature): string {
  return FEATURE_LABELS[feature];
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

  return { billing: updated, changed };
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getBillingSnapshot(): { billing: BillingInfo } | null {
  const profile = getUserProfile();
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
    updateUserProfile({ billing });
  }

  return { billing };
}

function shouldNag(billing: BillingInfo): boolean {
  if (!billing.lastPaywallShownAt) {
    return Math.random() < NAG_PROBABILITY;
  }

  const lastShown = new Date(billing.lastPaywallShownAt).getTime();
  if (Number.isFinite(lastShown) && Date.now() - lastShown < NAG_COOLDOWN_MS) {
    return false;
  }

  return Math.random() < NAG_PROBABILITY;
}

export function checkBillingAccess(feature: BillingFeature): BillingDecision | null {
  const snapshot = getBillingSnapshot();
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

  if (shouldNag(billing)) {
    return { allow: true, mode: "nag", reason: "nag", used, limit, billing };
  }

  return { allow: true, mode: "allow", reason: "ok", used, limit, billing };
}

export function recordBillingUsage(feature: BillingFeature): void {
  if (isByokFree()) return;
  const snapshot = getBillingSnapshot();
  if (!snapshot) return;

  const billing = snapshot.billing;
  const usageKey = FEATURE_USAGE_MAP[feature];
  const updatedUsage = {
    ...billing.usage,
    [usageKey]: billing.usage[usageKey] + 1,
  };
  updateUserProfile({ billing: { ...billing, usage: updatedUsage } });
}

export function markPaywallShown(): void {
  const snapshot = getBillingSnapshot();
  if (!snapshot) return;

  const billing = snapshot.billing;
  updateUserProfile({
    billing: {
      ...billing,
      paywallImpressions: billing.paywallImpressions + 1,
      lastPaywallShownAt: new Date().toISOString(),
    },
  });
}

export async function validatePromoCode(
  rawCode: string,
  redeemedHashes: string[] = [],
): Promise<PromoValidationResult> {
  if (!isBrowser()) return { valid: false, reason: "invalid" };

  const normalized = normalizePromoCode(rawCode);
  if (!normalized) return { valid: false, reason: "invalid" };

  const codeHash = await hashPromoCode(normalized);
  const alreadyUsed = redeemedHashes.includes(codeHash);
  if (alreadyUsed) return { valid: false, reason: "used" };

  if (!PROMO_CODE_HASHES.includes(codeHash)) {
    return { valid: false, reason: "invalid" };
  }

  return {
    valid: true,
    codeHash,
    discountPercent: PROMO_CODE_DISCOUNT_PERCENT,
  };
}

export async function applyPromoToBilling(
  billing: BillingInfo,
  promoHash: string,
): Promise<BillingInfo> {
  if (!isBrowser()) return billing;

  const token = await createPromoToken(promoHash);
  setPromoCookie(token);

  const redeemed = billing.redeemedCodeHashes.includes(promoHash)
    ? billing.redeemedCodeHashes
    : [...billing.redeemedCodeHashes, promoHash];

  return {
    ...billing,
    discountPercent: PROMO_CODE_DISCOUNT_PERCENT,
    promoCodeHash: promoHash,
    redeemedCodeHashes: redeemed,
  };
}

export function getPromoToken(): string | null {
  if (!isBrowser()) return null;
  const cookies = document.cookie.split(";").map((value) => value.trim());
  const cookie = cookies.find((value) => value.startsWith(`${PROMO_COOKIE_NAME}=`));
  if (!cookie) return null;
  return cookie.split("=")[1] || null;
}

export async function getPaymentConfig(): Promise<BillingPaymentConfig> {
  const response = await fetch(`${BACKEND_URL}/api/billing/config`);
  if (!response.ok) {
    throw new Error("No se pudo obtener la configuración de pago");
  }
  return (await response.json()) as BillingPaymentConfig;
}

export async function verifyPayment(txId: string): Promise<BillingPaymentResult> {
  const snapshot = getBillingSnapshot();
  const promoToken = snapshot?.billing.promoCodeHash;
  const response = await fetch(`${BACKEND_URL}/api/billing/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txId, promoToken }),
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
  } else {
    billing.status = "pending";
  }

  updateUserProfile({ billing });
  return result;
}

export async function refreshPaymentStatus(): Promise<void> {
  const snapshot = getBillingSnapshot();
  if (!snapshot) return;

  const billing = snapshot.billing;
  if (!billing.lastPaymentTxId || billing.status !== "pending") return;

  await verifyPayment(billing.lastPaymentTxId);
}

function normalizePromoCode(rawCode: string): string | null {
  const cleaned = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(cleaned)) return null;
  return cleaned;
}

async function hashPromoCode(code: string): Promise<string> {
  return await sha256Hex(`${PROMO_CODE_PEPPER}:${code}`);
}

function getPromoSalt(): string {
  const existing = localStorage.getItem(PROMO_SALT_KEY);
  if (existing) return existing;

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  localStorage.setItem(PROMO_SALT_KEY, salt);
  return salt;
}

async function createPromoToken(codeHash: string): Promise<string> {
  const salt = getPromoSalt();
  return await sha256Hex(`${salt}:${codeHash}`);
}

function setPromoCookie(token: string): void {
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${PROMO_COOKIE_NAME}=${token}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
