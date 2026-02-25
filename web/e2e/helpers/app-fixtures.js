const PUTER_ORIGIN = "https://api.puterjs.com";

function jsonFulfill(body, status = 200, extraHeaders = {}) {
  return {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function textFulfill(body, status = 200, extraHeaders = {}) {
  return {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      ...extraHeaders,
    },
    body,
  };
}

function createChatCompletion(content) {
  return {
    id: "chatcmpl_e2e",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "llama-3.1-8b",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 12,
      completion_tokens: 8,
      total_tokens: 20,
    },
  };
}

function parseJsonBody(request) {
  const raw = request.postData();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function withResponse(response, fallbackBody, fallbackStatus = 200) {
  if (!response) {
    return jsonFulfill(fallbackBody, fallbackStatus);
  }

  if (typeof response === "number") {
    return jsonFulfill(fallbackBody, response);
  }

  if (typeof response === "string") {
    return textFulfill(response, fallbackStatus);
  }

  if (response.body !== undefined || response.status !== undefined) {
    const status = response.status ?? fallbackStatus;
    const body = response.body ?? fallbackBody;
    const headers = response.headers ?? {};

    if (typeof body === "string") {
      return textFulfill(body, status, headers);
    }
    return jsonFulfill(body, status, headers);
  }

  return jsonFulfill(response, fallbackStatus);
}

export async function installBackendStubs(page, options = {}) {
  const matchesPath = (path, suffix) => path === suffix || path.endsWith(suffix);
  const backendHosts = new Set([
    "anglicus-api.anglicus-api.workers.dev",
    "anglicus-api.workers.dev",
    ...(options.backendHosts ?? []),
  ]);

  const calls = {
    register: [],
    login: [],
    refresh: [],
    chat: [],
    billingConfig: [],
    billingStatus: [],
    checkoutCreate: [],
    checkoutStatus: [],
    remindersUnsubscribe: [],
    unhandled: [],
  };

  const checkoutStatusSequence = [...(options.checkoutStatusSequence ?? [])];

  await page.route("**/*", async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    const url = new URL(request.url());
    const path = url.pathname;
    const sameOriginBackendPath = /^\/(?:auth|api|v1)(?:\/|$)/.test(path);
    const isBackendHost = backendHosts.has(url.hostname);
    const isLocalHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    const isBackendPath = isBackendHost || (isLocalHost && sameOriginBackendPath);

    let normalizedPath = path;
    if (path.startsWith("/api/auth/") || path === "/api/auth") {
      normalizedPath = path.slice(4);
    } else if (path.startsWith("/api/v1/") || path === "/api/v1") {
      normalizedPath = path.slice(4);
    }
    const headers = request.headers();
    const body = parseJsonBody(request);

    if (!isBackendPath) {
      return route.continue();
    }

    if (method === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        body: "",
      });
    }

    if (method === "POST" && matchesPath(normalizedPath, "/auth/register")) {
      const call = { method, path, headers, body };
      calls.register.push(call);
      const response = options.onRegister?.(call);
      return route.fulfill(
        withResponse(response, { success: true }, 200),
      );
    }

    if (method === "POST" && matchesPath(normalizedPath, "/auth/login")) {
      const call = { method, path, headers, body };
      calls.login.push(call);
      const response = options.onLogin?.(call);
      return route.fulfill(
        withResponse(response, { token: "test-token" }, 200),
      );
    }

    if (method === "POST" && matchesPath(normalizedPath, "/auth/refresh")) {
      const call = { method, path, headers, body };
      calls.refresh.push(call);
      const response = options.onRefresh?.(call);
      return route.fulfill(
        withResponse(response, { token: "test-token-refreshed" }, 200),
      );
    }

    if (method === "POST" && matchesPath(normalizedPath, "/v1/chat/completions")) {
      const call = { method, path, headers, body };
      calls.chat.push(call);
      const response = options.onChat?.(call);
      return route.fulfill(
        withResponse(response, createChatCompletion("Stubbed response"), 200),
      );
    }

    if (method === "GET" && matchesPath(normalizedPath, "/api/billing/config")) {
      const call = { method, path, headers, body };
      calls.billingConfig.push(call);
      const response = options.onBillingConfig?.(call);
      return route.fulfill(
        withResponse(
          response,
          {
            address: "bc1qtestfallback",
            network: "mainnet",
            minSats: 1000,
            subscriptionDays: 30,
            priceUsd: 12,
            checkoutRails: [
              { asset: "btc", network: "bitcoin", symbol: "sats", label: "Bitcoin" },
            ],
          },
          200,
        ),
      );
    }

    if (method === "GET" && matchesPath(normalizedPath, "/api/billing/status")) {
      const call = { method, path, headers, body };
      calls.billingStatus.push(call);
      const response = options.onBillingStatus?.(call);
      return route.fulfill(
        withResponse(
          response,
          {
            planType: "free",
            planExpiresDay: null,
            isActive: false,
            effectivePlanType: "free",
          },
          200,
        ),
      );
    }

    if (
      method === "POST" &&
      matchesPath(normalizedPath, "/api/billing/checkout/session")
    ) {
      const call = { method, path, headers, body };
      calls.checkoutCreate.push(call);
      const response = options.onCheckoutCreate?.(call);
      return route.fulfill(
        withResponse(
          response,
          {
            sessionId: "sess_e2e_1",
            address: "bc1qcheckoute2e",
            asset: "btc",
            network: "bitcoin",
            symbol: "sats",
            requiredAmount: "1000",
            requiredAmountAtomic: "1000",
            subscriptionDays: 30,
            confirmationsRequired: 1,
            status: "awaiting_payment",
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            disclaimer: {
              en: "Crypto payments are irreversible.",
              es: "Los pagos en crypto son irreversibles.",
            },
          },
          200,
        ),
      );
    }

    if (
      method === "GET" &&
      /\/api\/billing\/checkout\/session\/[^/]+\/status$/.test(normalizedPath)
    ) {
      const call = { method, path, headers, body };
      calls.checkoutStatus.push(call);
      let response = options.onCheckoutStatus?.(call);
      if (!response && checkoutStatusSequence.length > 0) {
        response = checkoutStatusSequence.shift();
      }
      return route.fulfill(
        withResponse(
          response,
          {
            sessionId: "sess_e2e_1",
            status: "awaiting_payment",
            asset: "btc",
            network: "bitcoin",
            symbol: "sats",
            requiredAmount: "1000",
            requiredAmountAtomic: "1000",
          },
          200,
        ),
      );
    }

    if (
      method === "POST" &&
      matchesPath(normalizedPath, "/api/reminders/unsubscribe")
    ) {
      const call = { method, path, headers, body };
      calls.remindersUnsubscribe.push(call);
      const response = options.onReminderUnsubscribe?.(call);
      return route.fulfill(withResponse(response, { success: true }, 200));
    }

    if (
      method === "POST" &&
      matchesPath(normalizedPath, "/api/analytics/event")
    ) {
      return route.fulfill(withResponse(options.onAnalyticsEvent?.(), { ok: true }, 200));
    }

    calls.unhandled.push({ method, path, normalizedPath, headers, body });

    return route.fulfill(
      jsonFulfill(
        {
          error: {
            message: `Unhandled stubbed backend route: ${method} ${path}`,
          },
        },
        500,
      ),
    );
  });

  return { calls };
}

export async function installPuterStub(page, options = {}) {
  await page.route(`${PUTER_ORIGIN}/**`, async (route) => {
    const request = route.request();
    if (request.method().toUpperCase() !== "POST") {
      return route.fulfill(jsonFulfill({ error: "method_not_allowed" }, 405));
    }

    const call = {
      headers: request.headers(),
      body: parseJsonBody(request),
    };

    const response = options.onPuterChat?.(call);
    return route.fulfill(
      withResponse(response, createChatCompletion("Stubbed Puter response"), 200),
    );
  });
}

export async function clearClientState(page) {
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();

    const deleteDb = (name) =>
      new Promise((resolve) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      });

    await deleteDb("AnglicusMistakes");
    await deleteDb("anglicus_secure_v1");
  });
}

export async function waitForHydration(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(
    () => document.documentElement.getAttribute("data-anglicus-hydrated") === "true",
    null,
    { timeout: 15000 },
  );
}

export async function setAuthToken(page, token = "test-token") {
  await page.evaluate((value) => {
    localStorage.setItem("anglicus_auth_token", value);
  }, token);
}

export async function setAppSettings(page, patch = {}) {
  await page.evaluate((settingsPatch) => {
    const defaults = {
      apiConfig: {
        tier: "auto",
      },
      theme: "light",
      notificationsEnabled: false,
      emailRemindersEnabled: false,
      dailyReminderTime: "20:00",
      reminderFrequency: "daily",
    };

    const raw = localStorage.getItem("anglicus_settings");
    const current = raw ? JSON.parse(raw) : defaults;
    const next = {
      ...current,
      ...settingsPatch,
      apiConfig: {
        ...defaults.apiConfig,
        ...(current.apiConfig || {}),
        ...(settingsPatch.apiConfig || {}),
      },
    };

    localStorage.setItem("anglicus_settings", JSON.stringify(next));
  }, patch);
}

export async function resetClientSecurityCounters(page) {
  await page.evaluate(() => {
    localStorage.removeItem("_a1r_rate");
    sessionStorage.removeItem("_a1m_sess_usage");
  });
}

export function buildProfile(overrides = {}) {
  const nowIso = new Date().toISOString();
  const defaults = {
    schemaVersion: 2,
    name: "E2E User",
    email: "e2e@example.com",
    level: "A2",
    nativeLanguage: "es",
    targetLanguage: "en",
    goals: ["general"],
    weakAreas: [],
    createdAt: nowIso,
    lastActiveAt: nowIso,
    streakDays: 3,
    totalXP: 250,
    wordsLearned: 40,
    weeklyActivity: [5, 8, 10, 12, 7, 0, 0],
    achievements: [],
    skills: [{ id: "greetings", status: "current", stars: 1 }],
    speaking: {
      totalAttempts: 0,
      totalDurationMs: 0,
      averageScore: 0,
      lastScore: 0,
      recentSessions: [],
    },
    billing: {
      plan: "free",
      status: "none",
      usage: {
        date: nowIso.slice(0, 10),
        tutorMessages: 0,
        quickChatMessages: 0,
        lessonExplanations: 0,
        tutorQuestions: 0,
        speakingSessions: 0,
      },
      paywallImpressions: 0,
      redeemedCodeHashes: [],
    },
  };

  const merged = {
    ...defaults,
    ...overrides,
    speaking: {
      ...defaults.speaking,
      ...(overrides.speaking || {}),
    },
    billing: {
      ...defaults.billing,
      ...(overrides.billing || {}),
      usage: {
        ...defaults.billing.usage,
        ...(overrides.billing?.usage || {}),
      },
    },
  };

  return merged;
}

export async function seedUserProfile(page, overrides = {}) {
  const profile = buildProfile(overrides);

  await page.evaluate(async (value) => {
    const key = "_a1u_data";
    const data = JSON.stringify(value);

    const encoded = new TextEncoder().encode(data + key);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    const hex = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");

    localStorage.setItem(key, data);
    localStorage.setItem("_a1c_hash", hex.slice(0, 16));
    localStorage.setItem("_a1v_schema", "2");
  }, profile);

  return profile;
}

export async function seedMistake(page, id = "delete-e2e-mistake") {
  await page.evaluate(async (mistakeId) => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("AnglicusMistakes", 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("mistakes")) {
          const store = db.createObjectStore("mistakes", { keyPath: "id" });
          store.createIndex("category", "category", { unique: false });
          store.createIndex("timestamp", "timestamp", { unique: false });
        }
      };

      request.onerror = () => {
        reject(request.error ?? new Error("Could not open mistakes database"));
      };

      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(["mistakes"], "readwrite");
        const store = tx.objectStore("mistakes");

        store.put({
          id: mistakeId,
          sentence: "She have two cats.",
          correction: "She has two cats.",
          explanation: "Use 'has' for third person singular.",
          category: "grammar",
          timestamp: new Date().toISOString(),
          source: "lesson",
        });

        tx.onerror = () => {
          reject(tx.error ?? new Error("Could not seed mistake"));
        };

        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  }, id);
}

export async function getMistakeCount(page) {
  return page.evaluate(async () => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("AnglicusMistakes", 1);

      request.onerror = () => {
        reject(request.error ?? new Error("Could not open mistakes database"));
      };

      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(["mistakes"], "readonly");
        const store = tx.objectStore("mistakes");
        const readRequest = store.getAll();

        readRequest.onerror = () => {
          reject(readRequest.error ?? new Error("Could not read mistakes"));
        };

        readRequest.onsuccess = () => {
          db.close();
          resolve(readRequest.result.length);
        };
      };
    });
  });
}

export function makePlacementQuestions() {
  return {
    questions: [
      {
        question: "Complete: I ___ coffee every morning.",
        options: ["drink", "drinks", "drank", "drinking"],
        correctAnswer: "drink",
        difficulty: "A1",
      },
      {
        question: "She ___ to Madrid yesterday.",
        options: ["go", "goes", "went", "going"],
        correctAnswer: "went",
        difficulty: "A2",
      },
      {
        question: "If I ___ more time, I would read more.",
        options: ["have", "had", "has", "having"],
        correctAnswer: "had",
        difficulty: "B1",
      },
      {
        question: "Despite ___ tired, he finished the report.",
        options: ["being", "be", "been", "to be"],
        correctAnswer: "being",
        difficulty: "B2",
      },
      {
        question: "It is essential that she ___ informed immediately.",
        options: ["is", "be", "was", "being"],
        correctAnswer: "be",
        difficulty: "C1",
      },
    ],
  };
}

export function buildChatCompletion(content) {
  return createChatCompletion(content);
}
