export type Locale = "en" | "zh";

/** User preference: follow browser, or force a locale. */
export type LocalePreference = Locale | "system";

export type MessageCatalog = Record<string, string>;
