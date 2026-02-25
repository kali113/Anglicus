import { expect, test } from "@playwright/test";
import {
  clearClientState,
  installBackendStubs,
  makePlacementQuestions,
  resetClientSecurityCounters,
  setAuthToken,
  waitForHydration,
} from "./helpers/app-fixtures.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await clearClientState(page);
});

test("placement flow persists profile and tutor chat uses backend contract", async ({ page }) => {
  const placementQuestions = makePlacementQuestions();
  const backend = await installBackendStubs(page, {
    onRefresh: () => ({
      status: 200,
      body: { token: "placement-token" },
    }),
    onChat: (call) => {
      if (call.body?.max_tokens >= 900) {
        return {
          status: 200,
          body: {
            id: "chatcmpl_placement",
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: "llama-3.1-8b",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: JSON.stringify(placementQuestions),
                },
                finish_reason: "stop",
              },
            ],
          },
        };
      }

      return {
        status: 200,
        body: {
          id: "chatcmpl_tutor",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "llama-3.1-8b",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "Strict tutor reply",
              },
              finish_reason: "stop",
            },
          ],
        },
      };
    },
  });

  await setAuthToken(page, "placement-token");

  await page.goto("/placement-test?step=name");
  await waitForHydration(page);

  await page.getByTestId("placement-name-input").fill("Placement User");
  await page.getByTestId("placement-email-input").fill("placement@example.com");
  await page.getByTestId("placement-identity-continue").click();

  await page.getByTestId("placement-promo-continue").click();
  await page.getByTestId("placement-goal-general").click();
  await page.getByTestId("placement-start-test").click();

  for (let i = 0; i < 5; i++) {
    await expect(page.getByTestId("placement-option-0")).toBeVisible();
    await page.getByTestId("placement-option-0").click();
  }

  await expect(page.getByTestId("placement-complete")).toBeVisible();
  await page.getByTestId("placement-complete").click();

  await expect(page).toHaveURL(/\/app(?:\?.*)?$/);

  await page.goto("/tutor");
  await waitForHydration(page);
  await resetClientSecurityCounters(page);
  await expect(page.getByTestId("tutor-input")).toBeVisible();

  await page.getByTestId("tutor-input").fill("Hello tutor");
  await page.getByTestId("tutor-send").click();

  await expect(page.getByText("Strict tutor reply")).toBeVisible();

  expect(backend.calls.chat.length).toBeGreaterThanOrEqual(2);
  const tutorCall = backend.calls.chat[backend.calls.chat.length - 1];
  expect(tutorCall.headers.authorization).toBe("Bearer placement-token");
  expect(tutorCall.headers["x-anglicus-feature"]).toBe("tutor");
  expect(Array.isArray(tutorCall.body.messages)).toBe(true);
  expect(tutorCall.body.messages.length).toBeGreaterThan(1);
});
