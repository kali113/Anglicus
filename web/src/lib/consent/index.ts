import { isBrowser } from "$lib/storage/base-store.js";

const CONSENT_STORAGE_KEY = "anglicus_cookie_consent_v1";
const CONSENT_EVENT_NAME = "anglicus:consent-changed";
const CONSENT_VERSION = 1;

export type ConsentChoice = "accepted" | "rejected";

export type ConsentState = {
  version: number;
  status: ConsentChoice;
  analytics: boolean;
  updatedAt: string;
};

export function getConsentState(): ConsentState | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    if (!parsed || typeof parsed !== "object") return null;

    if (parsed.status !== "accepted" && parsed.status !== "rejected") {
      return null;
    }

    return {
      version:
        typeof parsed.version === "number" && parsed.version > 0
          ? parsed.version
          : CONSENT_VERSION,
      status: parsed.status,
      analytics: parsed.status === "accepted",
      updatedAt:
        typeof parsed.updatedAt === "string" && parsed.updatedAt.length > 0
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function setAnalyticsConsent(choice: ConsentChoice): ConsentState {
  const state: ConsentState = {
    version: CONSENT_VERSION,
    status: choice,
    analytics: choice === "accepted",
    updatedAt: new Date().toISOString(),
  };

  if (isBrowser()) {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT_NAME, { detail: state }));
  }

  return state;
}

export function hasAnalyticsConsent(): boolean {
  const consent = getConsentState();
  return consent?.analytics === true;
}

export function shouldShowConsentBanner(): boolean {
  return getConsentState() === null;
}

export function onConsentChanged(
  callback: (state: ConsentState) => void,
): () => void {
  if (!isBrowser()) {
    return () => {};
  }

  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<ConsentState>;
    if (customEvent.detail) {
      callback(customEvent.detail);
    }
  };

  window.addEventListener(CONSENT_EVENT_NAME, listener as EventListener);
  return () => {
    window.removeEventListener(CONSENT_EVENT_NAME, listener as EventListener);
  };
}
