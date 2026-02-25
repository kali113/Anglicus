import { hasAnalyticsConsent } from "$lib/consent/index.js";
import { isBrowser } from "$lib/storage/base-store.js";
import { getTodayKey } from "$lib/utils/date.js";
import type { BillingInfo } from "$lib/types/user.js";
import { trackWebEvent } from "$lib/analytics/index.js";

export type AdsRewardFeature =
  | "tutor"
  | "lessonChat"
  | "quickChat"
  | "lessonExplanation"
  | "tutorQuestion"
  | "speaking";

export type AdsBreakReason = "lesson_complete" | "exercises_complete";

export type InterstitialDecision = {
  allow: boolean;
  remainingToday: number;
};

const ADS_STATE_KEY = "anglicus_ads_state_v1";
const ADSENSE_SCRIPT_ID = "anglicus-adsense-script";
const MAX_INTERSTITIALS_PER_DAY = 2;
const MAX_REWARDED_GRANTS_PER_DAY = 5;

type AdsState = {
  date: string;
  rewardedGrantsToday: number;
  interstitialsToday: number;
  rewardedBoosts: Partial<Record<AdsRewardFeature, number>>;
};

const DEFAULT_STATE = (): AdsState => ({
  date: getTodayKey(),
  rewardedGrantsToday: 0,
  interstitialsToday: 0,
  rewardedBoosts: {},
});

const REWARDED_BOOSTS: Record<AdsRewardFeature, number> = {
  tutor: 3,
  lessonChat: 2,
  quickChat: 2,
  lessonExplanation: 1,
  tutorQuestion: 1,
  speaking: 1,
};

function isFreeUser(billing?: BillingInfo | null): boolean {
  if (!billing) return false;
  return !(billing.plan === "pro" && billing.status === "active");
}

function readState(): AdsState {
  if (!isBrowser()) return DEFAULT_STATE();

  try {
    const raw = localStorage.getItem(ADS_STATE_KEY);
    if (!raw) return DEFAULT_STATE();

    const parsed = JSON.parse(raw) as Partial<AdsState>;
    if (!parsed || typeof parsed !== "object") return DEFAULT_STATE();

    const state: AdsState = {
      date:
        typeof parsed.date === "string" && parsed.date.length > 0
          ? parsed.date
          : getTodayKey(),
      rewardedGrantsToday:
        typeof parsed.rewardedGrantsToday === "number" &&
        Number.isFinite(parsed.rewardedGrantsToday)
          ? Math.max(0, Math.floor(parsed.rewardedGrantsToday))
          : 0,
      interstitialsToday:
        typeof parsed.interstitialsToday === "number" &&
        Number.isFinite(parsed.interstitialsToday)
          ? Math.max(0, Math.floor(parsed.interstitialsToday))
          : 0,
      rewardedBoosts:
        parsed.rewardedBoosts && typeof parsed.rewardedBoosts === "object"
          ? (parsed.rewardedBoosts as AdsState["rewardedBoosts"])
          : {},
    };

    if (state.date !== getTodayKey()) return DEFAULT_STATE();
    return state;
  } catch {
    return DEFAULT_STATE();
  }
}

function writeState(state: AdsState): void {
  if (!isBrowser()) return;
  localStorage.setItem(ADS_STATE_KEY, JSON.stringify(state));
}

function updateState(mutator: (state: AdsState) => void): AdsState {
  const state = readState();
  mutator(state);
  writeState(state);
  return state;
}

export function isAdsEnabled(): boolean {
  if (!isBrowser()) return false;
  return import.meta.env.VITE_ADS_ENABLED === "true";
}

export function isAdsenseEnabled(): boolean {
  return isAdsEnabled() && Boolean(import.meta.env.VITE_ADSENSE_CLIENT_ID);
}

export function getAdsenseClientId(): string | null {
  const value = import.meta.env.VITE_ADSENSE_CLIENT_ID;
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.trim();
}

export function shouldRenderAds(billing?: BillingInfo | null): boolean {
  return isAdsEnabled() && hasAnalyticsConsent() && isFreeUser(billing);
}

export async function ensureAdsenseScript(): Promise<boolean> {
  if (!isAdsenseEnabled()) return false;
  const clientId = getAdsenseClientId();
  if (!clientId || !isBrowser()) return false;

  if (document.getElementById(ADSENSE_SCRIPT_ID)) return true;

  const script = document.createElement("script");
  script.id = ADSENSE_SCRIPT_ID;
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
    clientId,
  )}`;
  script.crossOrigin = "anonymous";

  const loaded = new Promise<boolean>((resolve) => {
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
  });

  document.head.appendChild(script);
  return loaded;
}

export function getRewardedBoostForFeature(feature: AdsRewardFeature): number {
  const state = readState();
  return Math.max(0, state.rewardedBoosts[feature] ?? 0);
}

export function getRewardedGrantAmount(feature: AdsRewardFeature): number {
  return REWARDED_BOOSTS[feature];
}

export function canOfferRewardedBoost(
  feature: AdsRewardFeature | null,
  billing?: BillingInfo | null,
): boolean {
  if (!feature) return false;
  if (!shouldRenderAds(billing)) return false;

  const state = readState();
  if (state.rewardedGrantsToday >= MAX_REWARDED_GRANTS_PER_DAY) {
    return false;
  }

  return true;
}

export async function grantRewardedBoost(
  feature: AdsRewardFeature,
): Promise<{ success: boolean; amount: number; totalBoost: number }> {
  if (!canOfferRewardedBoost(feature)) {
    return { success: false, amount: REWARDED_BOOSTS[feature], totalBoost: 0 };
  }

  const amount = REWARDED_BOOSTS[feature];
  const state = updateState((draft) => {
    draft.rewardedGrantsToday += 1;
    draft.rewardedBoosts[feature] = (draft.rewardedBoosts[feature] ?? 0) + amount;
  });

  void trackWebEvent("ad_reward_granted", {
    metadata: {
      feature,
      amount,
      grantsToday: state.rewardedGrantsToday,
      totalBoost: state.rewardedBoosts[feature] ?? 0,
    },
  });

  return {
    success: true,
    amount,
    totalBoost: state.rewardedBoosts[feature] ?? 0,
  };
}

export function getInterstitialDecision(billing?: BillingInfo | null): InterstitialDecision {
  if (!shouldRenderAds(billing)) {
    return { allow: false, remainingToday: 0 };
  }

  const state = readState();
  const remaining = Math.max(0, MAX_INTERSTITIALS_PER_DAY - state.interstitialsToday);
  return {
    allow: remaining > 0,
    remainingToday: remaining,
  };
}

export async function markInterstitialShown(reason: AdsBreakReason): Promise<void> {
  const state = updateState((draft) => {
    draft.interstitialsToday += 1;
  });

  void trackWebEvent("ad_interstitial_shown", {
    metadata: {
      reason,
      interstitialsToday: state.interstitialsToday,
      remainingToday: Math.max(0, MAX_INTERSTITIALS_PER_DAY - state.interstitialsToday),
    },
  });
}

export async function markAdSlotImpression(placement: string): Promise<void> {
  void trackWebEvent("ad_slot_impression", {
    metadata: { placement },
  });
}
