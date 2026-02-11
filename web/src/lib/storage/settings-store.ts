/**
 * Settings storage using localStorage
 * Includes encrypted API key storage for BYOK
 */

import type { ApiConfig, ApiTier } from "$lib/types/api.js";
import { isBrowser } from "./base-store.js";
import { encrypt, decrypt } from "./crypto.js";

const SETTINGS_KEY = "anglicus_settings";
const ENCRYPTION_KEY_NAME = "anglicus_encryption_key";
const SALT_NAME = "anglicus_salt";

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
