import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../index.js";
import { issueJwt } from "../lib/auth.js";
import {
  handleBillingCheckoutCron,
  handleBillingCheckoutSessionCreate,
  handleBillingCheckoutSessionStatus,
  handleBillingConfig,
  handleBillingVerify,
} from "./billing.js";

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

type TestCheckoutSessionRow = {
  id: string;
  user_id: string;
  address: string;
  address_index: number;
  required_sats: number;
  asset: "btc" | "bnb" | "usdt";
  network_key: "bitcoin" | "bsc" | "ethereum" | "polygon" | "arbitrum";
  symbol: string;
  decimals: number;
  required_amount_atomic: string;
  subscription_days: number;
  status:
    | "awaiting_payment"
    | "pending_confirming"
    | "confirmed"
    | "underpaid"
    | "expired"
    | "verification_delayed"
    | "reorg_review";
  paid_sats: number | null;
  paid_amount_atomic: string | null;
  tx_id: string | null;
  confirmations: number | null;
  discount_source: "promo" | "referral" | null;
  token_contract: string | null;
  created_day: number;
  created_at: string;
  expires_at: string;
  last_checked_at: string | null;
  confirmed_at: string | null;
  paid_until: string | null;
  reason: string | null;
};

class MemoryD1 {
  private users = new Map<string, TestUserRow>();
  private billingClaims = new Map<string, string>();
  private checkoutSessions = new Map<string, TestCheckoutSessionRow>();
  private checkoutAddressIndices = new Map<string, number>();
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
        all: <T>() => this.all<T>(sql, args),
      }),
      first: <T>() => this.first<T>(sql, []),
      run: () => this.run(sql, []),
      all: <T>() => this.all<T>(sql, []),
    };
    return statement;
  }

  getUser(userId: string): TestUserRow | undefined {
    return this.users.get(userId);
  }

  private async first<T>(sql: string, args: unknown[]): Promise<T | null> {
    const normalizedSql = sql.toLowerCase();

    if (sql.includes("FROM users WHERE id = ?")) {
      const userId = String(args[0] ?? "");
      return (this.users.get(userId) ?? null) as T | null;
    }

    if (
      normalizedSql.includes(
        "from billing_checkout_address_indices where pool_key = ?",
      )
    ) {
      const poolKey = String(args[0] ?? "");
      const nextIndex = this.checkoutAddressIndices.get(poolKey);
      if (nextIndex === undefined) return null;
      return ({ next_index: nextIndex } as unknown) as T;
    }

    if (
      normalizedSql.includes("from billing_checkout_sessions where id = ? and user_id = ?")
    ) {
      const sessionId = String(args[0] ?? "");
      const userId = String(args[1] ?? "");
      const row = this.checkoutSessions.get(sessionId);
      if (!row || row.user_id !== userId) return null;
      return ({ ...row } as unknown) as T;
    }

    if (normalizedSql.includes("from billing_checkout_sessions where id = ?")) {
      const sessionId = String(args[0] ?? "");
      const row = this.checkoutSessions.get(sessionId);
      return (row ? { ...row } : null) as T | null;
    }

    if (
      normalizedSql.includes("from billing_checkout_sessions where user_id = ?") &&
      normalizedSql.includes("order by created_at desc")
    ) {
      const userId = String(args[0] ?? "");
      const asset = String(args[1] ?? "");
      const networkKey = String(args[2] ?? "");
      const nowIso = String(args[3] ?? "");
      const openStatuses = new Set([
        "awaiting_payment",
        "pending_confirming",
        "underpaid",
        "verification_delayed",
        "reorg_review",
      ]);
      const row =
        [...this.checkoutSessions.values()]
          .filter(
            (session) =>
              session.user_id === userId &&
              session.asset === asset &&
              session.network_key === networkKey &&
              openStatuses.has(session.status) &&
              session.expires_at > nowIso,
          )
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
      return (row ? { ...row } : null) as T | null;
    }

    if (sql.includes("FROM billing_tx_claims WHERE tx_id = ?")) {
      const txId = String(args[0] ?? "");
      const userId = this.billingClaims.get(txId) ?? null;
      if (!userId) return null;
      return { user_id: userId } as T;
    }

    return null;
  }

  private async all<T>(
    sql: string,
    args: unknown[],
  ): Promise<{ results: T[] }> {
    const normalizedSql = sql.toLowerCase();
    if (
      normalizedSql.includes(
        "from billing_checkout_sessions where status in ('awaiting_payment', 'pending_confirming', 'underpaid', 'verification_delayed', 'reorg_review')",
      )
    ) {
      const nowIso = String(args[0] ?? "");
      const limit = Number(args[1] ?? 200);
      const openStatuses = new Set([
        "awaiting_payment",
        "pending_confirming",
        "underpaid",
        "verification_delayed",
        "reorg_review",
      ]);
      const rows = [...this.checkoutSessions.values()]
        .filter(
          (session) =>
            openStatuses.has(session.status) && session.expires_at > nowIso,
        )
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .slice(0, limit)
        .map((row) => ({ ...row } as unknown as T));
      return { results: rows };
    }
    return { results: [] };
  }

  private async run(sql: string, args: unknown[]): Promise<{ meta: { changes: number } }> {
    const normalizedSql = sql.toLowerCase();

    if (sql.includes("CREATE TABLE IF NOT EXISTS billing_tx_claims")) {
      return { meta: { changes: 0 } };
    }

    if (sql.includes("CREATE INDEX IF NOT EXISTS idx_billing_tx_claims_user_id")) {
      return { meta: { changes: 0 } };
    }

    if (normalizedSql.includes("create table if not exists billing_checkout_sessions")) {
      return { meta: { changes: 0 } };
    }

    if (normalizedSql.includes("create index if not exists idx_billing_checkout_sessions_")) {
      return { meta: { changes: 0 } };
    }

    if (
      normalizedSql.includes(
        "create table if not exists billing_checkout_address_indices",
      )
    ) {
      return { meta: { changes: 0 } };
    }

    if (
      normalizedSql.includes(
        "insert or ignore into billing_checkout_address_indices",
      )
    ) {
      const poolKey = String(args[0] ?? "");
      if (!poolKey || this.checkoutAddressIndices.has(poolKey)) {
        return { meta: { changes: 0 } };
      }
      this.checkoutAddressIndices.set(poolKey, 0);
      return { meta: { changes: 1 } };
    }

    if (
      normalizedSql.includes(
        "update billing_checkout_address_indices set next_index = ?",
      )
    ) {
      const nextIndex = Number(args[0] ?? -1);
      const poolKey = String(args[1] ?? "");
      const expected = Number(args[2] ?? -1);
      const current = this.checkoutAddressIndices.get(poolKey);
      if (current === undefined || current !== expected) {
        return { meta: { changes: 0 } };
      }
      this.checkoutAddressIndices.set(poolKey, nextIndex);
      return { meta: { changes: 1 } };
    }

    if (normalizedSql.includes("insert into billing_checkout_sessions")) {
      const sessionId = String(args[0] ?? "");
      if (this.checkoutSessions.has(sessionId)) {
        return { meta: { changes: 0 } };
      }
      const row: TestCheckoutSessionRow = {
        id: sessionId,
        user_id: String(args[1] ?? ""),
        address: String(args[2] ?? ""),
        address_index: Number(args[3] ?? 0),
        required_sats: Number(args[4] ?? 0),
        asset: String(args[5] ?? "btc") as TestCheckoutSessionRow["asset"],
        network_key:
          (String(args[6] ?? "bitcoin") as TestCheckoutSessionRow["network_key"]),
        symbol: String(args[7] ?? "sats"),
        decimals: Number(args[8] ?? 0),
        required_amount_atomic: String(args[9] ?? args[4] ?? "0"),
        subscription_days: Number(args[10] ?? 30),
        status:
          (String(args[11] ?? "awaiting_payment") as TestCheckoutSessionRow["status"]),
        paid_sats: null,
        paid_amount_atomic: null,
        tx_id: null,
        confirmations: null,
        discount_source: (args[12] as "promo" | "referral" | null) ?? null,
        token_contract: args[13] === null ? null : String(args[13] ?? ""),
        created_day: Number(args[14] ?? 0),
        created_at: new Date().toISOString(),
        expires_at: String(args[15] ?? ""),
        last_checked_at: null,
        confirmed_at: null,
        paid_until: null,
        reason: null,
      };
      this.checkoutSessions.set(sessionId, row);
      return { meta: { changes: 1 } };
    }

    if (
      normalizedSql.includes("update billing_checkout_sessions set status = ?") &&
      normalizedSql.includes("where id = ?")
    ) {
      const sessionId = String(args[9] ?? "");
      const row = this.checkoutSessions.get(sessionId);
      if (!row) return { meta: { changes: 0 } };

      row.status = String(args[0] ?? row.status) as TestCheckoutSessionRow["status"];
      row.paid_sats = args[1] === null ? null : Number(args[1] ?? row.paid_sats ?? 0);
      row.paid_amount_atomic =
        args[2] === null ? null : String(args[2] ?? row.paid_amount_atomic ?? "");
      row.tx_id = args[3] === null ? null : String(args[3] ?? row.tx_id ?? "");
      row.confirmations =
        args[4] === null ? null : Number(args[4] ?? row.confirmations ?? 0);
      row.last_checked_at =
        args[5] === null ? null : String(args[5] ?? row.last_checked_at ?? "");
      row.confirmed_at =
        args[6] === null ? null : String(args[6] ?? row.confirmed_at ?? "");
      row.paid_until =
        args[7] === null ? null : String(args[7] ?? row.paid_until ?? "");
      row.reason = args[8] === null ? null : String(args[8] ?? row.reason ?? "");
      this.checkoutSessions.set(sessionId, row);
      return { meta: { changes: 1 } };
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

function createCheckoutSessionRequest(
  token: string,
  extraBody?: Record<string, unknown>,
): Request {
  return new Request("https://api.test/api/billing/checkout/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(extraBody || {}),
  });
}

function createCheckoutStatusRequest(sessionId: string, token: string): Request {
  return new Request(`https://api.test/api/billing/checkout/session/${sessionId}/status`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
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
    BTC_CHECKOUT_ADDRESS_POOL: "bc1qcheckoutaddress01,bc1qcheckoutaddress02",
    BTC_CHECKOUT_SESSION_TTL_MINUTES: "60",
    BTC_CONFIRMATIONS_REQUIRED: "1",
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

function stubCheckoutExplorerResponses(
  address: string,
  options: {
    paidSats: number;
    txId?: string;
    confirmed?: boolean;
    blockHeight?: number;
    tipHeight?: number;
  },
): void {
  const txId = options.txId || "e".repeat(64);
  const confirmed = options.confirmed ?? true;
  const blockHeight = options.blockHeight ?? 200;
  const tipHeight = options.tipHeight ?? 205;
  const txPayload = [
    {
      txid: txId,
      vout: [
        {
          value: options.paidSats,
          scriptpubkey_address: address,
        },
      ],
      status: {
        confirmed,
        block_height: confirmed ? blockHeight : undefined,
      },
    },
  ];

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const rawUrl = typeof input === "string" ? input : input.toString();
    if (rawUrl.includes("/address/") && rawUrl.includes("/txs")) {
      return new Response(JSON.stringify(txPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (rawUrl.includes("/blocks/tip/height")) {
      return new Response(String(tipHeight), {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new Response("not-found", { status: 404 });
  });
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

  it("creates and reuses an open checkout session for the same user", async () => {
    const db = new MemoryD1(["user-1"]);
    const token = await issueUserToken("user-1");
    const env = createEnv(db);

    const first = await handleBillingCheckoutSessionCreate(
      createCheckoutSessionRequest(token),
      env,
    );
    expect(first.status).toBe(200);
    const firstData = (await first.json()) as {
      sessionId: string;
      status: string;
      address: string;
      asset: string;
      network: string;
      symbol: string;
      requiredAmount: string;
      requiredAmountAtomic: string;
    };
    expect(firstData.status).toBe("awaiting_payment");
    expect(firstData.asset).toBe("btc");
    expect(firstData.network).toBe("bitcoin");
    expect(firstData.symbol).toBe("sats");
    expect(firstData.address).toBe("bc1qcheckoutaddress01");
    expect(firstData.requiredAmount).toBe("1000");
    expect(firstData.requiredAmountAtomic).toBe("1000");

    const second = await handleBillingCheckoutSessionCreate(
      createCheckoutSessionRequest(token),
      env,
    );
    expect(second.status).toBe(200);
    const secondData = (await second.json()) as {
      sessionId: string;
      address: string;
    };
    expect(secondData.sessionId).toBe(firstData.sessionId);
    expect(secondData.address).toBe(firstData.address);
  });

  it("auto-confirms a checkout session from address activity", async () => {
    const db = new MemoryD1(["user-1"]);
    const token = await issueUserToken("user-1");
    const env = createEnv(db);

    const created = await handleBillingCheckoutSessionCreate(
      createCheckoutSessionRequest(token),
      env,
    );
    const createData = (await created.json()) as { sessionId: string; address: string };
    stubCheckoutExplorerResponses(createData.address, {
      paidSats: 1200,
      confirmed: true,
      tipHeight: 220,
      blockHeight: 219,
      txId: "f".repeat(64),
    });

    const statusResponse = await handleBillingCheckoutSessionStatus(
      createCheckoutStatusRequest(createData.sessionId, token),
      env,
      createData.sessionId,
    );
    expect(statusResponse.status).toBe(200);
    const statusData = (await statusResponse.json()) as {
      status: string;
      requiredAmountAtomic: string;
      paidAmountAtomic: string;
      paidUntil?: string;
    };
    expect(statusData.status).toBe("confirmed");
    expect(statusData.requiredAmountAtomic).toBe("1000");
    expect(statusData.paidAmountAtomic).toBe("1200");
    expect(statusData.paidUntil).toBeTruthy();
    expect(db.getUser("user-1")?.plan_type).toBe("pro");
  });

  it("reconciles pending checkout sessions in cron", async () => {
    const db = new MemoryD1(["user-1"]);
    const token = await issueUserToken("user-1");
    const env = createEnv(db);

    const created = await handleBillingCheckoutSessionCreate(
      createCheckoutSessionRequest(token),
      env,
    );
    const createData = (await created.json()) as { address: string };
    stubCheckoutExplorerResponses(createData.address, {
      paidSats: 1000,
      confirmed: true,
      txId: "a".repeat(64),
    });

    await handleBillingCheckoutCron(new Date(), env);

    expect(db.getUser("user-1")?.plan_type).toBe("pro");
    expect(db.setUserPlanCalls).toBe(1);
  });
});
