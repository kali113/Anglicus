import { describe, expect, it } from "vitest";
import { sanitizePublicHttpsBaseUrl } from "./security.js";

describe("sanitizePublicHttpsBaseUrl", () => {
  it("accepts a normal public https endpoint", () => {
    const parsed = sanitizePublicHttpsBaseUrl("https://api.openai.com");
    expect(parsed?.href).toBe("https://api.openai.com/");
  });

  it("rejects non-https endpoints", () => {
    expect(sanitizePublicHttpsBaseUrl("http://api.openai.com")).toBeNull();
  });

  it("rejects localhost and private network hosts", () => {
    expect(sanitizePublicHttpsBaseUrl("https://localhost:11434")).toBeNull();
    expect(sanitizePublicHttpsBaseUrl("https://127.0.0.1:8787")).toBeNull();
    expect(sanitizePublicHttpsBaseUrl("https://10.0.0.5")).toBeNull();
    expect(sanitizePublicHttpsBaseUrl("https://172.16.1.20")).toBeNull();
    expect(sanitizePublicHttpsBaseUrl("https://192.168.1.10")).toBeNull();
    expect(sanitizePublicHttpsBaseUrl("https://[::1]")).toBeNull();
  });

  it("rejects credentialed URLs and URL suffix payloads", () => {
    expect(sanitizePublicHttpsBaseUrl("https://user:pass@api.openai.com")).toBeNull();
    expect(sanitizePublicHttpsBaseUrl("https://api.openai.com?x=1")).toBeNull();
    expect(sanitizePublicHttpsBaseUrl("https://api.openai.com#frag")).toBeNull();
  });
});
