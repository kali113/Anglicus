import type { Locale } from "$lib/i18n";
import en from "$lib/i18n/en.json";
import es from "$lib/i18n/es.json";

type Dictionary = Record<string, unknown>;
type Vars = Record<string, string | number>;

const dictionaries: Record<Locale, Dictionary> = {
  en,
  es,
};

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

export const translateLocale = (locale: Locale, key: string, vars?: Vars): string => {
  const message =
    resolvePath(dictionaries[locale], key) ??
    resolvePath(dictionaries.en, key) ??
    key;

  return format(message, vars);
};
