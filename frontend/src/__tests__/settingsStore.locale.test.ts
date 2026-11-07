/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("settingsStore localePreference", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it("defaults to system and persists sanitized localePreference", async () => {
    const { useSettingsStore } = await import("../store/settingsStore");
    expect(useSettingsStore.getState().localePreference).toBe("system");
    useSettingsStore.getState().setLocalePreference("zh");
    expect(useSettingsStore.getState().localePreference).toBe("zh");

    const persisted = JSON.parse(localStorage.getItem("ui-settings") || "{}") as {
      state?: { localePreference?: string };
    };
    expect(persisted.state?.localePreference).toBe("zh");
  });

  it("merge sanitizes invalid localePreference", async () => {
    localStorage.setItem(
      "ui-settings",
      JSON.stringify({ state: { localePreference: "nope", selectedCountry: "US" }, version: 0 }),
    );
    const { useSettingsStore } = await import("../store/settingsStore");
    expect(useSettingsStore.getState().localePreference).toBe("system");
  });
});
