import { browser } from "$app/environment";
import { derived, writable } from "svelte/store";
import en from "./en.json";
import es from "./es.json";

export type Locale = "en" | "es";
type Dictionary = Record<string, unknown>;
type Vars = Record<string, string | number>;

const translations: Record<Locale, Dictionary> = { en, es };
const STORAGE_KEY = "anglicus_locale";

const defaultLocale: Locale = "en";

export const locale = writable<Locale>(defaultLocale);

const LOCALE_PATH_RE = /\/(en|es)(?=\/|$)/;

const resolvePath = (dictionary: Dictionary, path: string): string | undefined => {
  const value = path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, dictionary);
  return typeof value === "string" ? value : undefined;
};

const format = (message: string, vars?: Vars): string =>
  message.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars && key in vars ? String(vars[key]) : `{${key}}`,
  );

export const resolveLocaleFromPath = (path: string): Locale | null => {
  const match = path.match(LOCALE_PATH_RE);
  if (!match) return null;
  return match[1] === "es" ? "es" : "en";
};

const detectLocale = (): Locale => {
  if (!browser) return defaultLocale;
  const pathLocale = resolveLocaleFromPath(window.location.pathname);
  if (pathLocale) return pathLocale;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "es") return stored;
  const language = navigator.language?.toLowerCase() ?? "";
  return language.startsWith("es") ? "es" : "en";
};

if (browser) {
  locale.set(detectLocale());
  locale.subscribe((value) => {
    localStorage.setItem(STORAGE_KEY, value);
    document.documentElement.lang = value;
  });
}

export const t = derived(locale, ($locale) => (key: string, vars?: Vars) => {
  const message =
    resolvePath(translations[$locale], key) ??
    resolvePath(translations.en, key) ??
    key;
  return format(message, vars);
});

export const setLocale = (value: Locale) => {
  locale.set(value);
};

export const toggleLocale = () => {
  locale.update((value) => (value === "es" ? "en" : "es"));
};
