import { expect, test } from "@playwright/test";
import {
  clearClientState,
  installBackendStubs,
  waitForHydration,
} from "./helpers/app-fixtures.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await clearClientState(page);
});

test("register enforces client validation and submits exact payload on success", async ({ page }) => {
  const backend = await installBackendStubs(page);

  await page.goto("/register");
  await waitForHydration(page);

  await page.locator('input[type="email"]').fill("user@example.com");
  await page.locator('input[type="password"]').fill("weakpass");
  await page.locator('form button[type="submit"]').click();

  await expect.poll(() => backend.calls.register.length).toBe(0);

  await page.locator('input[type="password"]').fill("StrongPass1");
  await page.locator('form button[type="submit"]').click();

  await expect(page).toHaveURL(/\/verify(?:\?.*)?$/);
  expect(backend.calls.register).toHaveLength(1);
  expect(backend.calls.register[0].body).toEqual({
    email: "user@example.com",
    password: "StrongPass1",
  });
});

test("register keeps user on page when server returns error", async ({ page }) => {
  const backend = await installBackendStubs(page, {
    onRegister: () => ({
      status: 502,
      body: {
        error: {
          message: "Registration unavailable",
        },
      },
    }),
  });

  await page.goto("/register");
  await waitForHydration(page);

  await page.locator('input[type="email"]').fill("error@example.com");
  await page.locator('input[type="password"]').fill("StrongPass1");
  await page.locator('form button[type="submit"]').click();

  await expect(page).toHaveURL(/\/register(?:\?.*)?$/);
  expect(backend.calls.register).toHaveLength(1);
});

test("login navigates only on successful auth and persists token", async ({ page }) => {
  const backend = await installBackendStubs(page, {
    onLogin: (call) => {
      if (call.body?.email === "ok@example.com") {
        return {
          status: 200,
          body: { token: "strict-login-token" },
        };
      }

      return {
        status: 401,
        body: {
          error: {
            message: "Invalid credentials",
          },
        },
      };
    },
  });

  await page.goto("/login");
  await waitForHydration(page);

  await page.locator('form button[type="submit"]').click();
  await expect.poll(() => backend.calls.login.length).toBe(0);

  await page.locator('input[type="email"]').fill("fail@example.com");
  await page.locator('input[type="password"]').fill("WrongPass1");
  await page.locator('form button[type="submit"]').click();

  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await expect.poll(async () => {
    return page.evaluate(() => localStorage.getItem("anglicus_auth_token"));
  }).toBeNull();

  await page.locator('input[type="email"]').fill("ok@example.com");
  await page.locator('input[type="password"]').fill("StrongPass1");
  await page.locator('form button[type="submit"]').click();

  await expect.poll(async () => {
    return page.evaluate(() => localStorage.getItem("anglicus_auth_token"));
  }).toBe("strict-login-token");
  await expect(page).not.toHaveURL(/\/login(?:\?.*)?$/);

  expect(backend.calls.login).toHaveLength(2);
  expect(backend.calls.login[0].body).toEqual({
    email: "fail@example.com",
    password: "WrongPass1",
  });
  expect(backend.calls.login[1].body).toEqual({
    email: "ok@example.com",
    password: "StrongPass1",
  });
});
