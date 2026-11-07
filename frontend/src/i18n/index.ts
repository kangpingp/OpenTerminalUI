import { en } from "./messages/en";
import { zh } from "./messages/zh";
import type { Locale, LocalePreference, MessageCatalog } from "./types";

export type { Locale, LocalePreference, MessageCatalog };
export { en, zh };

const catalogs: Record<Locale, MessageCatalog> = { en, zh };

export function detectBrowserLocale(lang?: string): Locale {
  const raw = (lang ?? (typeof navigator !== "undefined" ? navigator.language : "en") ?? "en").toLowerCase();
  return raw.startsWith("zh") ? "zh" : "en";
}

export function resolveLocale(preference: LocalePreference | null | undefined, browserLang?: string): Locale {
  if (preference === "en" || preference === "zh") return preference;
  return detectBrowserLocale(browserLang);
}

/** Look up a message; missing keys fall back to English, then the key itself. */
export function t(key: string, locale: Locale = "en"): string {
  const primary = catalogs[locale]?.[key];
  if (primary != null && primary !== "") return primary;
  if (locale !== "en") {
    const fallback = catalogs.en[key];
    if (fallback != null && fallback !== "") return fallback;
  }
  return key;
}

export function createTranslator(locale: Locale) {
  return (key: string) => t(key, locale);
}
