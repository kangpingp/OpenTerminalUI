import { describe, expect, it } from "vitest";

import { detectBrowserLocale, resolveLocale, t } from "../i18n";

describe("i18n", () => {
  it("falls back to English then the key itself when missing", () => {
    expect(t("nav.item.home", "en")).toBe("Home");
    expect(t("nav.item.home", "zh")).toBe("首页");
    expect(t("definitely.missing.key", "zh")).toBe("definitely.missing.key");
    expect(t("definitely.missing.key", "en")).toBe("definitely.missing.key");
  });

  it("detects zh* browser languages", () => {
    expect(detectBrowserLocale("zh-CN")).toBe("zh");
    expect(detectBrowserLocale("zh-TW")).toBe("zh");
    expect(detectBrowserLocale("en-US")).toBe("en");
    expect(detectBrowserLocale("fr-FR")).toBe("en");
  });

  it("resolves system preference via browser", () => {
    expect(resolveLocale("system", "zh-CN")).toBe("zh");
    expect(resolveLocale("en", "zh-CN")).toBe("en");
    expect(resolveLocale("zh", "en-US")).toBe("zh");
    expect(resolveLocale(undefined, "zh")).toBe("zh");
  });
});
