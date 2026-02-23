// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";

const mocks = vi.hoisted(() => ({
  goto: vi.fn(),
  clearAllMistakes: vi.fn(),
  stopBrowserReminder: vi.fn(),
  unsubscribeReminders: vi.fn(),
  getUserProfile: vi.fn(),
}));

const defaultSettings = {
  apiConfig: {
    tier: "auto",
    customBaseUrl: "",
  },
  theme: "light",
  notificationsEnabled: false,
  emailRemindersEnabled: false,
  dailyReminderTime: "20:00",
  reminderFrequency: "daily",
};

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

vi.mock("$app/navigation", () => ({
  goto: mocks.goto,
}));

vi.mock("$app/paths", () => ({
  base: "/app",
}));

vi.mock("$lib/storage/index.js", () => ({
  getSettings: () => ({
    ...defaultSettings,
    apiConfig: { ...defaultSettings.apiConfig },
  }),
  updateSettings: vi.fn(),
  setApiTier: vi.fn(),
  setCustomBaseUrl: vi.fn(),
  saveApiKey: vi.fn().mockResolvedValue(true),
  clearApiKey: vi.fn(),
  clearAllSettings: vi.fn(),
  clearUserProfile: vi.fn(),
  clearAllMistakes: mocks.clearAllMistakes,
}));

vi.mock("$lib/storage/user-store.js", () => ({
  getUserProfile: mocks.getUserProfile,
  updateUserProfile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("$lib/notifications/index.js", () => ({
  requestNotificationPermission: vi.fn().mockResolvedValue("granted"),
  startBrowserReminder: vi.fn(),
  stopBrowserReminder: mocks.stopBrowserReminder,
  showBrowserReminderNow: vi.fn().mockResolvedValue(undefined),
  subscribeReminders: vi.fn().mockResolvedValue(true),
  unsubscribeReminders: mocks.unsubscribeReminders,
  sendReminderTest: vi.fn().mockResolvedValue(true),
}));

vi.mock("$lib/ai/index.js", () => ({
  testConnection: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("$lib/analytics/index.js", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("$lib/auth/index.js", () => ({
  enableByok: vi.fn().mockResolvedValue(undefined),
}));

async function renderPage() {
  const { default: SettingsPage } = await import("./+page.svelte");
  return render(SettingsPage);
}

async function openDeleteModal() {
  await fireEvent.click(screen.getByTestId("clear-data-trigger"));
  return await screen.findByTestId("clear-data-confirm");
}

beforeEach(() => {
  const storage = new Map<string, string>();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.goto.mockReset();
  mocks.clearAllMistakes.mockReset();
  mocks.clearAllMistakes.mockResolvedValue(undefined);
  mocks.stopBrowserReminder.mockReset();
  mocks.unsubscribeReminders.mockReset();
  mocks.unsubscribeReminders.mockResolvedValue(true);
  mocks.getUserProfile.mockReset();
  mocks.getUserProfile.mockResolvedValue(null);
  vi.stubGlobal("alert", vi.fn());
  vi.stubGlobal("localStorage", {
    get length() {
      return storage.size;
    },
    clear: vi.fn(() => storage.clear()),
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(storage.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
  });
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  cleanup();
  vi.unstubAllGlobals();
});

describe("settings delete flow", () => {
  it("redirects to base-prefixed onboarding path after successful clear", async () => {
    await renderPage();
    const confirmButton = await openDeleteModal();

    await fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mocks.goto).toHaveBeenCalledWith("/app/onboarding");
    });
    expect(mocks.clearAllMistakes).toHaveBeenCalledTimes(1);
  });

  it("still clears local data when browser reminder stop throws", async () => {
    mocks.stopBrowserReminder.mockImplementationOnce(() => {
      throw new Error("stop failed");
    });

    await renderPage();
    const confirmButton = await openDeleteModal();

    await fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mocks.goto).toHaveBeenCalledWith("/app/onboarding");
    });
    expect(localStorage.clear).toHaveBeenCalledTimes(1);
    expect(mocks.clearAllMistakes).toHaveBeenCalledTimes(1);
  });

  it("still clears local data when reminder unsubscription throws", async () => {
    mocks.getUserProfile.mockResolvedValueOnce({
      name: "Alex",
      email: "alex@example.com",
      level: "A2",
      streakDays: 4,
      nativeLanguage: "es",
    });
    mocks.unsubscribeReminders.mockRejectedValueOnce(new Error("unsubscribe failed"));

    await renderPage();
    const confirmButton = await openDeleteModal();

    await fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mocks.goto).toHaveBeenCalledWith("/app/onboarding");
    });
    expect(mocks.stopBrowserReminder).toHaveBeenCalledTimes(1);
    expect(localStorage.clear).toHaveBeenCalledTimes(1);
    expect(mocks.clearAllMistakes).toHaveBeenCalledTimes(1);
  });
});
