import { useCallback, useMemo } from "react";

import { useSettingsStore } from "../store/settingsStore";
import { resolveLocale, t as translate } from "./index";
import type { Locale } from "./types";

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

function applyVars(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] != null ? String(vars[name]) : `{${name}}`,
  );
}

export function useI18n(): { locale: Locale; t: TranslateFn } {
  const preference = useSettingsStore((s) => s.localePreference);
  const locale = useMemo(() => resolveLocale(preference), [preference]);
  const t = useCallback<TranslateFn>(
    (key, vars) => applyVars(translate(key, locale), vars),
    [locale],
  );
  return { locale, t };
}
