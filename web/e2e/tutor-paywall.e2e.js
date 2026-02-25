import { expect, test } from "@playwright/test";
import {
  clearClientState,
  installBackendStubs,
  seedUserProfile,
  setAuthToken,
  waitForHydration,
} from "./helpers/app-fixtures.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await clearClientState(page);
});

test("tutor 429 opens paywall and checkout flow closes after confirmation", async ({ page }) => {
  let confirmed = false;

  const backend = await installBackendStubs(page, {
    onChat: () => ({
      status: 429,
      body: {
        error: "limit_reached",
        upgrade_url: "/billing",
      },
    }),
    checkoutStatusSequence: [
      {
        status: 200,
        body: {
          sessionId: "sess_e2e_1",
          status: "awaiting_payment",
          asset: "btc",
          network: "bitcoin",
          symbol: "sats",
          requiredAmount: "1000",
          requiredAmountAtomic: "1000",
        },
      },
      {
        status: 200,
        body: {
          sessionId: "sess_e2e_1",
          status: "pending_confirming",
          asset: "btc",
          network: "bitcoin",
          symbol: "sats",
          requiredAmount: "1000",
          requiredAmountAtomic: "1000",
          paidAmount: "1000",
          paidAmountAtomic: "1000",
          confirmations: 0,
        },
      },
      {
        status: 200,
        body: {
          sessionId: "sess_e2e_1",
          status: "confirmed",
          asset: "btc",
          network: "bitcoin",
          symbol: "sats",
          requiredAmount: "1000",
          requiredAmountAtomic: "1000",
          paidAmount: "1000",
          paidAmountAtomic: "1000",
          confirmations: 1,
          paidUntil: "2030-01-01T00:00:00.000Z",
        },
      },
    ],
    onBillingStatus: () => {
      if (confirmed) {
        return {
          status: 200,
          body: {
            planType: "pro",
            planExpiresDay: 30000,
            isActive: true,
            effectivePlanType: "pro",
            paidUntil: "2030-01-01T00:00:00.000Z",
          },
        };
      }
      return {
        status: 200,
        body: {
          planType: "free",
          planExpiresDay: null,
          isActive: false,
          effectivePlanType: "free",
        },
      };
    },
    onRefresh: () => ({
      status: 200,
      body: { token: "paywall-token" },
    }),
    onCheckoutStatus: () => {
      const callCount = backend.calls.checkoutStatus.length;
      if (callCount >= 3) {
        confirmed = true;
      }
      return undefined;
    },
  });

  await seedUserProfile(page, {
    name: "Paywall User",
    email: "paywall@example.com",
    billing: {
      plan: "free",
      status: "none",
    },
  });
  await setAuthToken(page, "paywall-token");

  await page.goto("/tutor");
  await waitForHydration(page);
  await expect(page.getByTestId("tutor-input")).toBeVisible();

  await page.getByTestId("tutor-input").fill("Trigger paywall");
  await page.getByTestId("tutor-send").click();

  await expect(page.getByTestId("paywall-modal")).toBeVisible();
  await expect(page.getByTestId("paywall-address")).toBeVisible();

  await page.getByTestId("paywall-check-status").click();
  await expect.poll(() => backend.calls.checkoutStatus.length).toBeGreaterThanOrEqual(2);

  await page.getByTestId("paywall-check-status").click();
  await expect.poll(() => backend.calls.checkoutStatus.length).toBeGreaterThanOrEqual(3);

  await expect(page.getByTestId("paywall-modal")).toBeHidden();

  expect(backend.calls.chat).toHaveLength(1);
  expect(backend.calls.chat[0].headers.authorization).toBe("Bearer paywall-token");
  expect(backend.calls.chat[0].headers["x-anglicus-feature"]).toBe("tutor");

  expect(backend.calls.checkoutCreate).toHaveLength(1);
  expect(backend.calls.checkoutCreate[0].headers.authorization).toBe("Bearer paywall-token");
  expect(backend.calls.billingStatus.length).toBeGreaterThan(0);
});
