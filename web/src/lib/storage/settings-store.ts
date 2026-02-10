/**
 * Settings storage using localStorage
 * Includes encrypted API key storage for BYOK
 */

import type { ApiConfig, ApiTier } from "$lib/types/api.js";
import { isBrowser } from "./base-store.js";

const SETTINGS_KEY = "anglicus_settings";

export interface AppSettings {
  apiConfig: ApiConfig;
  theme: "light" | "dark" | "auto";
  notificationsEnabled: boolean;
  emailRemindersEnabled: boolean;
  dailyReminderTime?: string; // HH:MM format
  reminderFrequency: "daily" | "weekly";
}

const DEFAULT_SETTINGS: AppSettings = {
  apiConfig: {
    tier: "auto",
  },
  theme: "light",
  notificationsEnabled: false,
  emailRemindersEnabled: false,
  dailyReminderTime: "20:00",
  reminderFrequency: "daily",
};

/**
 * Simple encryption for API keys (Web Crypto API)
 * Uses device-specific key derivation
 */
const ENCRYPTION_KEY_NAME = "anglicus_encryption_key";
const SALT_NAME = "anglicus_salt";

async function getEncryptionKey(): Promise<CryptoKey | null> {
  if (!isBrowser() || !window.crypto) return null;

  try {
    // Try to get existing key
    const storedKey = localStorage.getItem(ENCRYPTION_KEY_NAME);
    if (storedKey) {
      const keyData = JSON.parse(storedKey);
      return await window.crypto.subtle.importKey(
        "jwk",
        keyData,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
    }

    // Generate new key
    const key = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );

    // Export and store key
    const exportedKey = await window.crypto.subtle.exportKey("jwk", key);
    localStorage.setItem(ENCRYPTION_KEY_NAME, JSON.stringify(exportedKey));

    return key;
  } catch {
    return null;
  }
}

async function encrypt(text: string): Promise<string | null> {
  const key = await getEncryptionKey();
  if (!key) return null;

  try {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);

    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoded,
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
  } catch {
    return null;
  }
}

async function decrypt(encryptedData: string): Promise<string | null> {
  const key = await getEncryptionKey();
  if (!key) return null;

  try {
    const combined = Uint8Array.from(atob(encryptedData), (c) =>
      c.charCodeAt(0),
    );
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encrypted,
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

export async function saveApiKey(apiKey: string): Promise<boolean> {
  const encrypted = await encrypt(apiKey);
  if (!encrypted) return false;

  const settings = getSettings();
  settings.apiConfig.apiKeyEncrypted = encrypted;
  saveSettings(settings);
  return true;
}

export async function getApiKey(): Promise<string | null> {
  const settings = getSettings();
  const encrypted = settings.apiConfig.apiKeyEncrypted;
  if (!encrypted) return null;

  return await decrypt(encrypted);
}

export function clearApiKey(): void {
  const settings = getSettings();
  settings.apiConfig.apiKeyEncrypted = undefined;
  settings.apiConfig.tier = "auto";
  saveSettings(settings);
}

export function getSettings(): AppSettings {
  if (!isBrowser()) return DEFAULT_SETTINGS;

  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    if (!data) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (!isBrowser()) return;

  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function updateSettings(updates: Partial<AppSettings>): void {
  const settings = getSettings();
  const updated = { ...settings, ...updates };
  saveSettings(updated);
}

export function setApiTier(tier: ApiTier): void {
  updateSettings({
    apiConfig: { ...getSettings().apiConfig, tier },
  });
}

export function setCustomBaseUrl(url: string): void {
  updateSettings({
    apiConfig: { ...getSettings().apiConfig, customBaseUrl: url },
  });
}

export function clearAllSettings(): void {
  if (!isBrowser()) return;

  localStorage.removeItem(SETTINGS_KEY);
  localStorage.removeItem(ENCRYPTION_KEY_NAME);
  localStorage.removeItem(SALT_NAME);
}
