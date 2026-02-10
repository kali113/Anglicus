import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalStore, isBrowser } from "./base-store";

function createLocalStorageMock(): Storage {
  let store: Record<string, string> = {};

  return {
    get length() {
      return Object.keys(store).length;
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null;
    },
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key)
        ? store[key]
        : null;
    },
    setItem(key: string, value: string) {
      store[key] = value;
    },
    removeItem(key: string) {
      delete store[key];
    },
    clear() {
      store = {};
    },
  };
}

const originalWindow = globalThis.window;
const originalLocalStorage = globalThis.localStorage;

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: createLocalStorageMock(),
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: globalThis,
    configurable: true,
  });
});

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
  } else {
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
    });
  }
  if (originalLocalStorage === undefined) {
    Reflect.deleteProperty(globalThis, "localStorage");
  } else {
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      configurable: true,
    });
  }
});

describe("LocalStore", () => {
  it("detects browser environment", () => {
    expect(isBrowser()).toBe(true);
  });

  it("returns defaults when not in browser", () => {
    const savedWindow = globalThis.window;
    Reflect.deleteProperty(globalThis, "window");
    try {
      const store = new LocalStore("test-key", { count: 1 });
      expect(isBrowser()).toBe(false);
      expect(store.get()).toEqual({ count: 1 });
    } finally {
      Object.defineProperty(globalThis, "window", {
        value: savedWindow,
        configurable: true,
      });
    }
  });

  it("stores and merges defaults", () => {
    const store = new LocalStore<{ count: number; label?: string }>(
      "test-key",
      { count: 0, label: "default" },
    );
    store.set({ count: 2 });
    expect(store.get()).toEqual({ count: 2, label: "default" });
  });

  it("clears stored values", () => {
    const store = new LocalStore("test-key", { count: 0 });
    store.set({ count: 3 });
    expect(store.exists()).toBe(true);
    store.clear();
    expect(store.exists()).toBe(false);
  });
});
