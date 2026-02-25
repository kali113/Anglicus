import type { Locale } from "$lib/i18n";
import {
  DEFAULT_LOCALE,
  SITE_URL,
  SUPPORTED_LOCALES,
} from "$lib/seo/config";

export type HreflangAlternate = {
  hreflang: string;
  href: string;
};

const LOCALE_PREFIX_RE = /^\/(en|es)(?=\/|$)/;
const FILE_EXTENSION_RE = /\/[^/]+\.[^/]+$/;

const INDEXABLE_PATHS = new Set(["/en", "/es", "/en/legal", "/es/legal"]);

export const normalizePath = (path: string): string => {
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  const withoutIndexSuffix = withLeadingSlash.endsWith("/index.html")
    ? withLeadingSlash.slice(0, -"/index.html".length) || "/"
    : withLeadingSlash === "/index.html"
      ? "/"
      : withLeadingSlash;

  if (withoutIndexSuffix.length > 1 && withoutIndexSuffix.endsWith("/")) {
    return withoutIndexSuffix.slice(0, -1);
  }
  return withoutIndexSuffix;
};

const toCanonicalPath = (path: string): string => {
  const normalized = normalizePath(path);
  if (normalized === "/" || FILE_EXTENSION_RE.test(normalized)) {
    return normalized;
  }
  return `${normalized}/`;
};

type AbsoluteUrlOptions = {
  trailingSlash?: boolean;
};

export const toAbsoluteUrl = (
  path: string,
  options: AbsoluteUrlOptions = {},
): string => {
  const normalized = normalizePath(path);
  const finalPath = options.trailingSlash ? toCanonicalPath(normalized) : normalized;
  return finalPath === "/" ? `${SITE_URL}/` : `${SITE_URL}${finalPath}`;
};

const stripLocalePrefix = (path: string): string => {
  const stripped = normalizePath(path).replace(LOCALE_PREFIX_RE, "");
  return stripped || "/";
};

const toLocalizedPath = (path: string, locale: Locale): string => {
  const suffix = stripLocalePrefix(path);
  return suffix === "/" ? `/${locale}` : `/${locale}${suffix}`;
};

export const buildHreflangAlternates = (path: string): HreflangAlternate[] => {
  const normalized = normalizePath(path);
  const suffix = stripLocalePrefix(normalized);

  const alternates: HreflangAlternate[] = SUPPORTED_LOCALES.map((locale) => ({
    hreflang: locale,
    href: toAbsoluteUrl(toLocalizedPath(normalized, locale), {
      trailingSlash: true,
    }),
  }));

  const xDefaultPath =
    suffix === "/" ? "/" : toLocalizedPath(suffix, DEFAULT_LOCALE);

  alternates.push({
    hreflang: "x-default",
    href: toAbsoluteUrl(xDefaultPath, { trailingSlash: true }),
  });

  return alternates;
};

export const isIndexableSeoPath = (path: string): boolean =>
  INDEXABLE_PATHS.has(normalizePath(path));
