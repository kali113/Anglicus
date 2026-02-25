const BLOCKED_HOSTNAMES = new Set([
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "host.docker.internal",
  "metadata.google.internal",
]);

const BLOCKED_HOST_SUFFIXES = [
  ".local",
  ".internal",
  ".home.arpa",
];

function isIpv4Address(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

function ipv4ToInt(ip: string): number | null {
  const octets = ip.split(".");
  if (octets.length !== 4) return null;

  let result = 0;
  for (const octet of octets) {
    const value = Number(octet);
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      return null;
    }
    result = (result << 8) + value;
  }
  return result >>> 0;
}

function isPrivateIpv4(hostname: string): boolean {
  const value = ipv4ToInt(hostname);
  if (value === null) return true;

  const ranges = [
    [0x00000000, 0x00ffffff], // 0.0.0.0/8
    [0x0a000000, 0x0affffff], // 10.0.0.0/8
    [0x64400000, 0x647fffff], // 100.64.0.0/10
    [0x7f000000, 0x7fffffff], // 127.0.0.0/8
    [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16
    [0xac100000, 0xac1fffff], // 172.16.0.0/12
    [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16
    [0xc6120000, 0xc613ffff], // 198.18.0.0/15
  ] as const;

  return ranges.some(([min, max]) => value >= min && value <= max);
}

function parseMappedIpv6TailToIpv4(tail: string): string | null {
  const segments = tail.split(":");
  if (segments.length !== 2) return null;

  const high = Number.parseInt(segments[0], 16);
  const low = Number.parseInt(segments[1], 16);
  if (
    !Number.isInteger(high) ||
    !Number.isInteger(low) ||
    high < 0 ||
    low < 0 ||
    high > 0xffff ||
    low > 0xffff
  ) {
    return null;
  }

  const octets = [
    (high >> 8) & 0xff,
    high & 0xff,
    (low >> 8) & 0xff,
    low & 0xff,
  ];
  return octets.join(".");
}

function unwrapIpv6Literal(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = unwrapIpv6Literal(hostname.toLowerCase());
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9")) return true;
  if (normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    if (isIpv4Address(mapped)) return isPrivateIpv4(mapped);
    const mappedHex = parseMappedIpv6TailToIpv4(mapped);
    if (mappedHex) return isPrivateIpv4(mappedHex);
    return true;
  }
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = unwrapIpv6Literal(hostname.trim().toLowerCase());
  if (!normalized) return true;
  if (BLOCKED_HOSTNAMES.has(normalized)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return true;

  if (isIpv4Address(normalized)) {
    return isPrivateIpv4(normalized);
  }

  if (normalized.includes(":")) {
    return isPrivateIpv6(normalized);
  }

  return !normalized.includes(".");
}

export function sanitizePublicHttpsBaseUrl(rawUrl: string): URL | null {
  const candidate = rawUrl.trim();
  if (!candidate) return null;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.search || parsed.hash) return null;
  if (isBlockedHostname(parsed.hostname)) return null;

  return parsed;
}
