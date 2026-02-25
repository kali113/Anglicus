import type { UsageFeature } from "../lib/usage.js";

type UserRow = {
  id: string;
  email_hash: string;
  password_hash: string | null;
  verification_code: string | null;
  is_verified: number;
  auth_provider: "email" | "google" | "byok";
  plan_type: "free" | "pro";
  plan_expires_day: number | null;
};

type UsageRow = {
  user_id: string;
  day_number: number;
  feature: UsageFeature;
  count: number;
};

type RateLimitRow = {
  scope: string;
  identifier: string;
  window_start: number;
  count: number;
};

function usageKey(userId: string, dayNumber: number, feature: string): string {
  return `${userId}:${dayNumber}:${feature}`;
}

function rateLimitKey(scope: string, identifier: string, windowStart: number): string {
  return `${scope}:${identifier}:${windowStart}`;
}

export class MemoryD1 {
  private users = new Map<string, UserRow>();
  private usage = new Map<string, UsageRow>();
  private rateLimits = new Map<string, RateLimitRow>();

  seedUser(
    user: Partial<UserRow> & { id: string; email_hash?: string },
  ): void {
    const row: UserRow = {
      id: user.id,
      email_hash: user.email_hash ?? `hash-${user.id}`,
      password_hash: user.password_hash ?? null,
      verification_code: user.verification_code ?? null,
      is_verified: user.is_verified ?? 1,
      auth_provider: user.auth_provider ?? "email",
      plan_type: user.plan_type ?? "free",
      plan_expires_day: user.plan_expires_day ?? null,
    };
    this.users.set(row.id, row);
  }

  getUser(userId: string): UserRow | undefined {
    return this.users.get(userId);
  }

  setUsage(
    userId: string,
    dayNumber: number,
    feature: UsageFeature,
    count: number,
  ): void {
    const key = usageKey(userId, dayNumber, feature);
    this.usage.set(key, {
      user_id: userId,
      day_number: dayNumber,
      feature,
      count,
    });
  }

  getUsage(userId: string, dayNumber: number, feature: UsageFeature): number {
    const key = usageKey(userId, dayNumber, feature);
    return this.usage.get(key)?.count ?? 0;
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

  private async first<T>(sql: string, args: unknown[]): Promise<T | null> {
    const normalized = sql.toLowerCase();

    if (normalized.includes("from users where id = ?")) {
      const userId = String(args[0] ?? "");
      const row = this.users.get(userId);
      return (row ? ({ ...row } as unknown as T) : null);
    }

    if (normalized.includes("from users where email_hash = ?")) {
      const emailHash = String(args[0] ?? "");
      const row = [...this.users.values()].find((user) => user.email_hash === emailHash);
      return (row ? ({ ...row } as unknown as T) : null);
    }

    if (
      normalized.includes("select count from usage where user_id = ?") &&
      normalized.includes("day_number = ?") &&
      normalized.includes("feature = ?")
    ) {
      const userId = String(args[0] ?? "");
      const dayNumber = Number(args[1] ?? 0);
      const feature = String(args[2] ?? "") as UsageFeature;
      const key = usageKey(userId, dayNumber, feature);
      const row = this.usage.get(key);
      return (row ? ({ count: row.count } as unknown as T) : null);
    }

    if (
      normalized.includes("select count from rate_limits where scope = ?") &&
      normalized.includes("identifier = ?") &&
      normalized.includes("window_start = ?")
    ) {
      const scope = String(args[0] ?? "");
      const identifier = String(args[1] ?? "");
      const windowStart = Number(args[2] ?? 0);
      const key = rateLimitKey(scope, identifier, windowStart);
      const row = this.rateLimits.get(key);
      return ({ count: row?.count ?? 0 } as unknown) as T;
    }

    return null;
  }

  private async all<T>(_sql: string, _args: unknown[]): Promise<{ results: T[] }> {
    return { results: [] };
  }

  private async run(
    sql: string,
    args: unknown[],
  ): Promise<{ meta: { changes: number } }> {
    const normalized = sql.toLowerCase();

    if (
      normalized.includes("create table if not exists") ||
      normalized.includes("create index if not exists") ||
      normalized.includes("alter table users add column")
    ) {
      return { meta: { changes: 0 } };
    }

    if (
      normalized.includes("update users set auth_provider = ? where id = ?")
    ) {
      const authProvider = String(args[0] ?? "email") as UserRow["auth_provider"];
      const userId = String(args[1] ?? "");
      const row = this.users.get(userId);
      if (!row) return { meta: { changes: 0 } };
      row.auth_provider = authProvider;
      this.users.set(userId, row);
      return { meta: { changes: 1 } };
    }

    if (
      normalized.includes(
        "update users set plan_type = ?, plan_expires_day = ? where id = ?",
      )
    ) {
      const planType = String(args[0] ?? "free") as UserRow["plan_type"];
      const planExpiresDay =
        args[1] === null ? null : Number(args[1] ?? null);
      const userId = String(args[2] ?? "");
      const row = this.users.get(userId);
      if (!row) return { meta: { changes: 0 } };
      row.plan_type = planType;
      row.plan_expires_day = planExpiresDay;
      this.users.set(userId, row);
      return { meta: { changes: 1 } };
    }

    if (
      normalized.includes("insert into usage") &&
      normalized.includes("on conflict(user_id, day_number, feature)")
    ) {
      const userId = String(args[0] ?? "");
      const dayNumber = Number(args[1] ?? 0);
      const feature = String(args[2] ?? "") as UsageFeature;
      const key = usageKey(userId, dayNumber, feature);
      const existing = this.usage.get(key);
      if (!existing) {
        this.usage.set(key, {
          user_id: userId,
          day_number: dayNumber,
          feature,
          count: 1,
        });
      } else {
        existing.count += 1;
        this.usage.set(key, existing);
      }
      return { meta: { changes: 1 } };
    }

    if (
      normalized.includes("insert into rate_limits") &&
      normalized.includes("on conflict(scope, identifier, window_start)")
    ) {
      const scope = String(args[0] ?? "");
      const identifier = String(args[1] ?? "");
      const windowStart = Number(args[2] ?? 0);
      const key = rateLimitKey(scope, identifier, windowStart);
      const existing = this.rateLimits.get(key);
      if (!existing) {
        this.rateLimits.set(key, {
          scope,
          identifier,
          window_start: windowStart,
          count: 1,
        });
      } else {
        existing.count += 1;
        this.rateLimits.set(key, existing);
      }
      return { meta: { changes: 1 } };
    }

    if (
      normalized.includes("delete from rate_limits where scope = ? and window_start < ?")
    ) {
      const scope = String(args[0] ?? "");
      const threshold = Number(args[1] ?? 0);
      let changes = 0;
      for (const [key, row] of this.rateLimits.entries()) {
        if (row.scope === scope && row.window_start < threshold) {
          this.rateLimits.delete(key);
          changes += 1;
        }
      }
      return { meta: { changes } };
    }

    if (normalized.includes("insert into users")) {
      const userId = String(args[0] ?? "");
      if (!userId) return { meta: { changes: 0 } };
      if (this.users.has(userId)) return { meta: { changes: 0 } };

      this.users.set(userId, {
        id: userId,
        email_hash: String(args[1] ?? `hash-${userId}`),
        password_hash: args[2] === null ? null : String(args[2] ?? ""),
        verification_code: args[3] === null ? null : String(args[3] ?? ""),
        is_verified: Number(args[4] ?? 0),
        auth_provider: "email",
        plan_type: "free",
        plan_expires_day: null,
      });
      return { meta: { changes: 1 } };
    }

    return { meta: { changes: 0 } };
  }
}
