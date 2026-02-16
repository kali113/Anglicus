/**
 * Secure storage with anti-tampering measures
 * Makes it significantly harder to bypass limits by clearing storage
 */

import { isBrowser } from "./base-store.js";
import { bytesToHex } from "$lib/utils/crypto.js";

// Obfuscated storage keys
const STORAGE_KEYS = {
  primary: "_a1u_data",
  backup: "_a1s_meta", 
  fingerprint: "_a1f_id",
  timestamp: "_a1t_last",
  checksum: "_a1c_hash",
  schema: "_a1v_schema",
  session: "_a1m_sess",
  rateLimit: "_a1r_rate"
};
const STORAGE_SCHEMA_VERSION = "2";
const STORAGE_ENCRYPTION_PREFIX = "enc:v1:";

// Simple device fingerprint
function getDeviceFingerprint(): string {
  if (!isBrowser()) return "";
  
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + "x" + screen.height,
    screen.colorDepth,
    navigator.hardwareConcurrency,
    new Date().getTimezoneOffset()
  ];
  
  return btoa(components.join("|")).slice(0, 32);
}

// Generate checksum for data integrity
async function generateChecksum(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data + STORAGE_KEYS.primary); // Add salt
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  return bytesToHex(new Uint8Array(hashBuffer)).slice(0, 16);
}

// Verify data integrity
async function verifyChecksum(data: string, checksum: string | null): Promise<boolean> {
  if (!checksum) return false;
  const computed = await generateChecksum(data);
  return computed === checksum;
}

async function deriveStorageKey(): Promise<CryptoKey | null> {
  if (!isBrowser() || !window.crypto?.subtle) return null;

  try {
    const seed = `${getDeviceFingerprint()}|${location.origin}|${STORAGE_SCHEMA_VERSION}`;
    const encoded = new TextEncoder().encode(seed);
    const hash = await window.crypto.subtle.digest("SHA-256", encoded);
    return await window.crypto.subtle.importKey(
      "raw",
      hash,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

async function encryptForStorage(data: string): Promise<string | null> {
  const key = await deriveStorageKey();
  if (!key) return null;

  try {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(data);
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      plaintext,
    );

    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return `${STORAGE_ENCRYPTION_PREFIX}${bytesToBase64(combined)}`;
  } catch {
    return null;
  }
}

async function decryptFromStorage(data: string): Promise<string | null> {
  if (!data.startsWith(STORAGE_ENCRYPTION_PREFIX)) {
    // Legacy plaintext entries remain readable for migration.
    return data;
  }

  const key = await deriveStorageKey();
  if (!key) return null;

  try {
    const encoded = data.slice(STORAGE_ENCRYPTION_PREFIX.length);
    const combined = base64ToBytes(encoded);
    if (combined.length < 13) return null;

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const plaintext = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );

    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

// IndexedDB wrapper for persistent backup storage
class SecureIndexedDB {
  private dbName = "anglicus_secure_v1";
  private storeName = "userdata";
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (!isBrowser()) return;
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }

  async get(key: string): Promise<string | null> {
    if (!this.db) await this.init();
    if (!this.db) return null;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.put(value, key);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

const indexedDBStore = new SecureIndexedDB();

// Rate limiter to prevent rapid API calls
export class ClientRateLimiter {
  private maxRequests = 10;
  private windowMs = 60000; // 1 minute

  async checkLimit(): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    if (!isBrowser()) return { allowed: true, remaining: this.maxRequests, resetTime: 0 };

    const now = Date.now();
    const stored = localStorage.getItem(STORAGE_KEYS.rateLimit);
    let requests: number[] = [];

    if (stored) {
      try {
        requests = JSON.parse(stored).filter((t: number) => now - t < this.windowMs);
      } catch {
        requests = [];
      }
    }

    const allowed = requests.length < this.maxRequests;
    const remaining = Math.max(0, this.maxRequests - requests.length);
    const resetTime = requests.length > 0 ? requests[0] + this.windowMs : now;

    if (allowed) {
      requests.push(now);
      localStorage.setItem(STORAGE_KEYS.rateLimit, JSON.stringify(requests));
    }

    return { allowed, remaining, resetTime };
  }

  clear(): void {
    if (!isBrowser()) return;
    localStorage.removeItem(STORAGE_KEYS.rateLimit);
  }
}

export const clientRateLimiter = new ClientRateLimiter();

// Detect if storage was cleared
export async function detectStorageClear(): Promise<boolean> {
  if (!isBrowser()) return false;

  const fingerprint = getDeviceFingerprint();
  const storedFingerprint = localStorage.getItem(STORAGE_KEYS.fingerprint);
  const storedTimestamp = localStorage.getItem(STORAGE_KEYS.timestamp);

  // First visit - set fingerprint
  if (!storedFingerprint) {
    localStorage.setItem(STORAGE_KEYS.fingerprint, fingerprint);
    localStorage.setItem(STORAGE_KEYS.timestamp, Date.now().toString());
    localStorage.setItem(STORAGE_KEYS.schema, STORAGE_SCHEMA_VERSION);
    return false;
  }

  // Check if fingerprint matches (different device/browser)
  if (storedFingerprint !== fingerprint) {
    // Could be different device, not necessarily cleared
    return false;
  }

  // Check if primary data exists
  const primaryData = localStorage.getItem(STORAGE_KEYS.primary);
  const backupData = await indexedDBStore.get(STORAGE_KEYS.backup);

  // If primary is gone but backup exists = storage was cleared
  if (!primaryData && backupData) {
    return true;
  }

  // Update timestamp
  localStorage.setItem(STORAGE_KEYS.timestamp, Date.now().toString());
  return false;
}

// Secure storage operations
export async function secureSet(key: "primary" | "backup", data: string): Promise<void> {
  if (!isBrowser()) return;

  const protectedData = await encryptForStorage(data);
  if (!protectedData) {
    throw new Error("Unable to encrypt secure storage payload");
  }

  const checksum = await generateChecksum(protectedData);
  const fingerprint = getDeviceFingerprint();

  if (key === "primary") {
    localStorage.setItem(STORAGE_KEYS.primary, protectedData);
    localStorage.setItem(STORAGE_KEYS.checksum, checksum);
    localStorage.setItem(STORAGE_KEYS.fingerprint, fingerprint);
    localStorage.setItem(STORAGE_KEYS.timestamp, Date.now().toString());
    localStorage.setItem(STORAGE_KEYS.schema, STORAGE_SCHEMA_VERSION);
    
    // Also backup to IndexedDB (harder to clear)
    await indexedDBStore.set(STORAGE_KEYS.backup, protectedData);
  } else {
    await indexedDBStore.set(STORAGE_KEYS.backup, protectedData);
  }
}

export async function secureGet(): Promise<string | null> {
  if (!isBrowser()) return null;

  // Try primary storage first
  const primaryData = localStorage.getItem(STORAGE_KEYS.primary);
  const storedChecksum = localStorage.getItem(STORAGE_KEYS.checksum);

  if (primaryData && storedChecksum) {
    const isValid = await verifyChecksum(primaryData, storedChecksum);
    if (isValid) {
      const unwrapped = await decryptFromStorage(primaryData);
      if (unwrapped === null) return null;
      if (localStorage.getItem(STORAGE_KEYS.schema) !== STORAGE_SCHEMA_VERSION) {
        localStorage.setItem(STORAGE_KEYS.schema, STORAGE_SCHEMA_VERSION);
      }
      return unwrapped;
    }
  }

  // If primary is invalid/missing, try backup from IndexedDB
  const backupData = await indexedDBStore.get(STORAGE_KEYS.backup);
  if (backupData) {
    const unwrapped = await decryptFromStorage(backupData);
    if (unwrapped === null) return null;

    // Restore primary from backup
    let protectedBackup = backupData;
    if (!backupData.startsWith(STORAGE_ENCRYPTION_PREFIX)) {
      const encrypted = await encryptForStorage(unwrapped);
      if (encrypted) {
        protectedBackup = encrypted;
        await indexedDBStore.set(STORAGE_KEYS.backup, protectedBackup);
      }
    }

    const checksum = await generateChecksum(protectedBackup);
    localStorage.setItem(STORAGE_KEYS.primary, protectedBackup);
    localStorage.setItem(STORAGE_KEYS.checksum, checksum);
    localStorage.setItem(STORAGE_KEYS.schema, STORAGE_SCHEMA_VERSION);
    return unwrapped;
  }

  return null;
}

export function secureClear(): void {
  if (!isBrowser()) return;
  
  Object.values(STORAGE_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
  
  clientRateLimiter.clear();
  indexedDBStore.clear();
}

// Session-based tracking (lost when tab closes, prevents simple refresh abuse)
export function getSessionId(): string {
  if (!isBrowser()) return "";
  
  let sessionId = sessionStorage.getItem(STORAGE_KEYS.session);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(STORAGE_KEYS.session, sessionId);
  }
  return sessionId;
}

export function getSessionUsage(): number {
  if (!isBrowser()) return 0;
  
  const sessionId = getSessionId();
  const stored = sessionStorage.getItem(`${STORAGE_KEYS.session}_usage`);
  
  if (stored) {
    const data = JSON.parse(stored);
    if (data.sessionId === sessionId) {
      return data.count;
    }
  }
  
  return 0;
}

export function incrementSessionUsage(): void {
  if (!isBrowser()) return;
  
  const sessionId = getSessionId();
  const count = getSessionUsage() + 1;
  
  sessionStorage.setItem(
    `${STORAGE_KEYS.session}_usage`,
    JSON.stringify({ sessionId, count, timestamp: Date.now() })
  );
}

// Check for suspicious activity patterns
export async function checkSuspiciousActivity(): Promise<{
  isSuspicious: boolean;
  reason?: string;
  action: "allow" | "warn" | "block";
}> {
  if (!isBrowser()) return { isSuspicious: false, action: "allow" };

  // Check if storage was cleared
  const wasCleared = await detectStorageClear();
  if (wasCleared) {
    return {
      isSuspicious: true,
      reason: "Storage cleared - possible limit reset attempt",
      action: "block"
    };
  }

  // Check rate limiting
  const rateLimit = await clientRateLimiter.checkLimit();
  if (!rateLimit.allowed) {
    return {
      isSuspicious: true,
      reason: "Rate limit exceeded",
      action: "block"
    };
  }

  // Check session usage (prevents rapid page refresh)
  const sessionUsage = getSessionUsage();
  if (sessionUsage > 50) {
    return {
      isSuspicious: true,
      reason: "Excessive activity in current session",
      action: "warn"
    };
  }

  return { isSuspicious: false, action: "allow" };
}
