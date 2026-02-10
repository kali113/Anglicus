/**
 * LocalStore Base Class
 * Generic localStorage wrapper with type safety and SSR support
 */

/**
 * Check if running in browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * Generic localStorage wrapper for type-safe storage
 */
export class LocalStore<T> {
  private key: string;
  private defaultValue: T;

  constructor(key: string, defaultValue: T) {
    this.key = key;
    this.defaultValue = defaultValue;
  }

  /**
   * Get the stored value, or default if not found
   */
  get(): T {
    if (!isBrowser()) return this.defaultValue;

    try {
      const data = localStorage.getItem(this.key);
      if (!data) return this.defaultValue;
      return { ...this.defaultValue, ...JSON.parse(data) };
    } catch {
      return this.defaultValue;
    }
  }

  /**
   * Get raw value without merging with defaults
   */
  getRaw(): T | null {
    if (!isBrowser()) return null;

    try {
      const data = localStorage.getItem(this.key);
      if (!data) return null;
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * Set the stored value
   */
  set(value: T): void {
    if (!isBrowser()) return;
    localStorage.setItem(this.key, JSON.stringify(value));
  }

  /**
   * Update the stored value using a function
   */
  update(fn: (current: T) => T): void {
    const current = this.get();
    const updated = fn(current);
    this.set(updated);
  }

  /**
   * Clear the stored value
   */
  clear(): void {
    if (!isBrowser()) return;
    localStorage.removeItem(this.key);
  }

  /**
   * Check if a value exists
   */
  exists(): boolean {
    if (!isBrowser()) return false;
    return localStorage.getItem(this.key) !== null;
  }
}

/**
 * Create a new LocalStore instance
 */
export function createStore<T>(key: string, defaultValue: T): LocalStore<T> {
  return new LocalStore(key, defaultValue);
}
