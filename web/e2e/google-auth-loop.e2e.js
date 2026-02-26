import { expect, test } from "@playwright/test";
import {
  clearClientState,
  installBackendStubs,
  setAuthToken,
  waitForHydration,
} from "./helpers/app-fixtures.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await clearClientState(page);
});

test("placement identity step hides Google sign-in shortcut when already authenticated", async ({ page }) => {
  await installBackendStubs(page);
  await setAuthToken(page, "loop-fix-token");

  await page.goto("/placement-test?step=name");
  await waitForHydration(page);

  await expect(page.locator(".google-shortcut")).toHaveCount(0);
  await expect(page.getByTestId("placement-identity-continue")).toBeVisible();
});
