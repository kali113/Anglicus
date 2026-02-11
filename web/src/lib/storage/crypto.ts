/**
 * Shared encryption utilities (AES-GCM-256)
 * Used for encrypting sensitive data like API keys
 */

import { isBrowser } from "./base-store.js";

const ENCRYPTION_KEY_NAME = "anglicus_encryption_key";

export async function getEncryptionKey(): Promise<CryptoKey | null> {
  if (!isBrowser() || !window.crypto) return null;

  try {
    // Try to get existing key
    const storedKey = localStorage.getItem(ENCRYPTION_KEY_NAME);
    if (storedKey) {
      const keyData = JSON.parse(storedKey);
      return await window.crypto.subtle.importKey(
        "jwk",
        keyData,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
    }

    // Generate new key
    const key = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );

    // Export and store key
    const exportedKey = await window.crypto.subtle.exportKey("jwk", key);
    localStorage.setItem(ENCRYPTION_KEY_NAME, JSON.stringify(exportedKey));

    return key;
  } catch {
    return null;
  }
}

export async function encrypt(text: string): Promise<string | null> {
  const key = await getEncryptionKey();
  if (!key) return null;

  try {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);

    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoded,
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
  } catch {
    return null;
  }
}

export async function decrypt(encryptedData: string): Promise<string | null> {
  const key = await getEncryptionKey();
  if (!key) return null;

  try {
    const combined = Uint8Array.from(atob(encryptedData), (c) =>
      c.charCodeAt(0),
    );
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encrypted,
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}
