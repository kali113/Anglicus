import { expect, test } from "@playwright/test";
import {
  clearClientState,
  getMistakeCount,
  installBackendStubs,
  seedMistake,
  seedUserProfile,
  setAppSettings,
  setAuthToken,
  waitForHydration,
} from "./helpers/app-fixtures.js";

async function openSeededSettings(page) {
  await page.goto("/settings");
  await waitForHydration(page);
  await seedUserProfile(page, {
    email: "cleanup@example.com",
    name: "Cleanup User",
  });
  await setAuthToken(page, "cleanup-token");
  await setAppSettings(page, {
    theme: "dark",
    notificationsEnabled: true,
    emailRemindersEnabled: true,
  });
  await page.reload();
  await waitForHydration(page);
  await expect(page.getByTestId("clear-data-trigger")).toBeVisible();
}

async function openDeleteModal(page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByTestId("clear-data-trigger").click();
    try {
      await expect(page.locator(".modal-backdrop")).toBeVisible({ timeout: 2000 });
      return;
    } catch {
      // Retry in case hydration finished between attempts.
    }
  }

  await expect(page.locator(".modal-backdrop")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await clearClientState(page);
});

test("delete confirmation cancel keeps local and indexed state intact", async ({ page }) => {
  await installBackendStubs(page);
  await openSeededSettings(page);

  await page.evaluate(() => {
    localStorage.setItem("anglicus_delete_probe", "keep-me");
  });
  await seedMistake(page, "cancel-preserve-mistake");

  await openDeleteModal(page);
  await page.getByTestId("clear-data-cancel").click();

  await expect(page).toHaveURL(/\/settings(?:\?.*)?$/);

  await expect.poll(async () => {
    return page.evaluate(() => localStorage.getItem("anglicus_delete_probe"));
  }).toBe("keep-me");

  await expect.poll(async () => getMistakeCount(page)).toBe(1);
});

test("delete confirmation clears auth/profile/settings state and redirects", async ({ page }) => {
  const backend = await installBackendStubs(page);
  await openSeededSettings(page);

  await page.evaluate(() => {
    localStorage.setItem("anglicus_delete_probe", "delete-me");
  });
  await seedMistake(page, "delete-flow-mistake");

  await openDeleteModal(page);
  await page.getByTestId("clear-data-confirm").click();

  await expect(page).toHaveURL(/\/placement-test(?:\?.*)?$/);

  const expectedClearedKeys = [
    "anglicus_settings",
    "anglicus_auth_token",
    "anglicus_delete_probe",
  ];

  for (const key of expectedClearedKeys) {
    await expect.poll(async () => {
      return page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
    }).toBeNull();
  }

  await expect.poll(async () => getMistakeCount(page)).toBe(0);

  expect(backend.calls.remindersUnsubscribe).toHaveLength(1);
  expect(backend.calls.remindersUnsubscribe[0].body).toEqual({
    email: "cleanup@example.com",
  });
});
