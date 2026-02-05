/**
 * LocalStore Base Class
 * Generic localStorage wrapper with type safety and SSR support
 */

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
   * Check if running in browser environment
   */
  private isBrowser(): boolean {
    return typeof window !== "undefined";
  }

  /**
   * Get the stored value, or default if not found
   */
  get(): T {
    if (!this.isBrowser()) return this.defaultValue;

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
    if (!this.isBrowser()) return null;

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
    if (!this.isBrowser()) return;
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
    if (!this.isBrowser()) return;
    localStorage.removeItem(this.key);
  }

  /**
   * Check if a value exists
   */
  exists(): boolean {
    if (!this.isBrowser()) return false;
    return localStorage.getItem(this.key) !== null;
  }
}

/**
 * Create a new LocalStore instance
 */
export function createStore<T>(key: string, defaultValue: T): LocalStore<T> {
  return new LocalStore(key, defaultValue);
}
