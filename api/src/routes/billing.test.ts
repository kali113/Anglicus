import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../index.js";
import { issueJwt } from "../lib/auth.js";
import { handleBillingConfig, handleBillingVerify } from "./billing.js";

type TestUserRow = {
  id: string;
  email_hash: string;
  password_hash: string | null;
  verification_code: string | null;
  is_verified: number;
  auth_provider: string;
  plan_type: "free" | "pro";
  plan_expires_day: number | null;
};

class MemoryD1 {
  private users = new Map<string, TestUserRow>();
  private billingClaims = new Map<string, string>();
  public setUserPlanCalls = 0;

  constructor(userIds: string[]) {
    for (const userId of userIds) {
      this.users.set(userId, {
        id: userId,
        email_hash: `hash-${userId}`,
        password_hash: null,
        verification_code: null,
        is_verified: 1,
        auth_provider: "email",
        plan_type: "free",
        plan_expires_day: null,
      });
    }
  }

  prepare(sql: string) {
    const statement = {
      bind: (...args: unknown[]) => ({
        first: <T>() => this.first<T>(sql, args),
        run: () => this.run(sql, args),
      }),
      first: <T>() => this.first<T>(sql, []),
      run: () => this.run(sql, []),
    };
    return statement;
  }

  getUser(userId: string): TestUserRow | undefined {
    return this.users.get(userId);
  }

  private async first<T>(sql: string, args: unknown[]): Promise<T | null> {
    if (sql.includes("FROM users WHERE id = ?")) {
      const userId = String(args[0] ?? "");
      return (this.users.get(userId) ?? null) as T | null;
    }

    if (sql.includes("FROM billing_tx_claims WHERE tx_id = ?")) {
      const txId = String(args[0] ?? "");
      const userId = this.billingClaims.get(txId) ?? null;
      if (!userId) return null;
      return { user_id: userId } as T;
    }

    return null;
  }

  private async run(sql: string, args: unknown[]): Promise<{ meta: { changes: number } }> {
    if (sql.includes("CREATE TABLE IF NOT EXISTS billing_tx_claims")) {
      return { meta: { changes: 0 } };
    }

    if (sql.includes("CREATE INDEX IF NOT EXISTS idx_billing_tx_claims_user_id")) {
      return { meta: { changes: 0 } };
    }

    if (sql.includes("INSERT OR IGNORE INTO billing_tx_claims")) {
      const txId = String(args[0] ?? "");
      const userId = String(args[1] ?? "");
      if (this.billingClaims.has(txId)) {
        return { meta: { changes: 0 } };
      }
      this.billingClaims.set(txId, userId);
      return { meta: { changes: 1 } };
    }

    if (sql.includes("DELETE FROM billing_tx_claims WHERE tx_id = ? AND user_id = ?")) {
      const txId = String(args[0] ?? "");
      const userId = String(args[1] ?? "");
      if (this.billingClaims.get(txId) === userId) {
        this.billingClaims.delete(txId);
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }

    if (sql.includes("UPDATE users SET plan_type = ?, plan_expires_day = ? WHERE id = ?")) {
      const planType = args[0] as "free" | "pro";
      const planExpiresDay = args[1] as number | null;
      const userId = String(args[2] ?? "");
      const user = this.users.get(userId);
      if (!user) {
        return { meta: { changes: 0 } };
      }
      user.plan_type = planType;
      user.plan_expires_day = planExpiresDay;
      this.users.set(userId, user);
      this.setUserPlanCalls += 1;
      return { meta: { changes: 1 } };
    }

    return { meta: { changes: 0 } };
  }
}

function createVerifyRequest(
  txId: string,
  token: string,
  extraBody?: Record<string, unknown>,
): Request {
  return new Request("https://api.test/api/billing/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ txId, ...extraBody }),
  });
}

function createEnv(db: MemoryD1, overrides: Partial<Env> = {}): Env {
  return {
    DB: db as unknown as D1Database,
    JWT_SECRET: "test-secret",
    BTC_RECEIVING_ADDRESS: "bc1qtestaddress",
    BTC_MIN_SATS: "1000",
    BTC_SUBSCRIPTION_DAYS: "30",
    BTC_NETWORK: "mainnet",
    ...overrides,
  };
}

function stubConfirmedExplorerResponses(address: string, values: number[]): void {
  const payload = {
    vout: values.map((value) => ({
      value,
      scriptpubkey_address: address,
    })),
    status: {
      confirmed: true,
      block_height: 100,
    },
  };

  const payloadJson = JSON.stringify(payload);
  const fetchMock = vi
    .fn()
    .mockImplementation(
      async () =>
        new Response(payloadJson, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
  vi.stubGlobal("fetch", fetchMock);
}

async function issueUserToken(userId: string): Promise<string> {
  return issueJwt("test-secret", { user_id: userId });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("billing routes", () => {
  it("rejects invalid txId format before explorer lookups", async () => {
    const db = new MemoryD1(["user-1"]);
    const token = await issueUserToken("user-1");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleBillingVerify(
      createVerifyRequest("invalid-tx", token),
      createEnv(db),
    );

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: { message: string } };
    expect(data.error.message).toBe("txId is invalid");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sums multiple outputs to the billing address", async () => {
    const db = new MemoryD1(["user-1"]);
    const token = await issueUserToken("user-1");
    const env = createEnv(db);
    stubConfirmedExplorerResponses(env.BTC_RECEIVING_ADDRESS!, [600, 500]);

    const response = await handleBillingVerify(
      createVerifyRequest("a".repeat(64), token),
      env,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      status: string;
      paidSats: number;
      requiredSats: number;
      paidUntil?: string;
    };
    expect(data.status).toBe("confirmed");
    expect(data.paidSats).toBe(1100);
    expect(data.requiredSats).toBe(1000);
    expect(data.paidUntil).toBeTruthy();
  });

  it("treats repeated tx verification by the same user as idempotent", async () => {
    const db = new MemoryD1(["user-1"]);
    const token = await issueUserToken("user-1");
    const env = createEnv(db);
    stubConfirmedExplorerResponses(env.BTC_RECEIVING_ADDRESS!, [1000]);

    const first = await handleBillingVerify(createVerifyRequest("b".repeat(64), token), env);
    expect(first.status).toBe(200);
    const planAfterFirst = db.getUser("user-1")?.plan_expires_day;

    const second = await handleBillingVerify(createVerifyRequest("b".repeat(64), token), env);
    expect(second.status).toBe(200);
    const secondPayload = (await second.json()) as { reason?: string };
    expect(secondPayload.reason).toBe("Transaction already verified");
    expect(db.getUser("user-1")?.plan_expires_day).toBe(planAfterFirst);
    expect(db.setUserPlanCalls).toBe(1);
  });

  it("rejects repeated tx verification by another user", async () => {
    const db = new MemoryD1(["user-1", "user-2"]);
    const tokenUser1 = await issueUserToken("user-1");
    const tokenUser2 = await issueUserToken("user-2");
    const env = createEnv(db);
    stubConfirmedExplorerResponses(env.BTC_RECEIVING_ADDRESS!, [1000]);

    const first = await handleBillingVerify(
      createVerifyRequest("c".repeat(64), tokenUser1),
      env,
    );
    expect(first.status).toBe(200);

    const second = await handleBillingVerify(
      createVerifyRequest("c".repeat(64), tokenUser2),
      env,
    );
    expect(second.status).toBe(409);
    const data = (await second.json()) as { error: { message: string } };
    expect(data.error.message).toBe("Transaction already used by another account");
  });

  it("normalizes invalid billing env values to safe defaults", async () => {
    const response = await handleBillingConfig(
      new Request("https://api.test/api/billing/config"),
      createEnv(new MemoryD1(["user-1"]), {
        BTC_MIN_SATS: "not-a-number",
        BTC_SUBSCRIPTION_DAYS: "-10",
        BTC_PRICE_USD: "invalid",
      }),
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      minSats: number;
      subscriptionDays: number;
      priceUsd: number;
    };
    expect(data.minSats).toBe(18000);
    expect(data.subscriptionDays).toBe(1);
    expect(data.priceUsd).toBe(12);
  });

  it("ignores unsigned promo tokens during verification", async () => {
    const db = new MemoryD1(["user-1"]);
    const token = await issueUserToken("user-1");
    const env = createEnv(db, {
      BTC_MIN_SATS: "1000",
      PROMO_CODE_PEPPER: "promo-pepper",
    });
    stubConfirmedExplorerResponses(env.BTC_RECEIVING_ADDRESS!, [750]);

    const response = await handleBillingVerify(
      createVerifyRequest("d".repeat(64), token, {
        promoToken:
          "de55b09032c7583c47b2c02c24e2099b357cc65f3e2e7152ed9591725ae5c4b0.invalidsignature",
      }),
      env,
    );

    expect(response.status).toBe(402);
    const data = (await response.json()) as { error: { message: string } };
    expect(data.error.message).toContain("1000 sats");
  });
});
