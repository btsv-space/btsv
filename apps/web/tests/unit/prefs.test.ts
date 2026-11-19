import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PREFS_STORAGE_KEY } from "$lib/shared/constants";

function mockLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  });
}

describe("prefs", () => {
  beforeEach(() => {
    vi.resetModules();
    mockLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts with an empty name", async () => {
    const { prefs } = await import("$lib/stores/prefs.svelte");
    expect(prefs.name).toBe("");
  });

  it("hydrates from localStorage", async () => {
    localStorage.setItem(
      PREFS_STORAGE_KEY,
      JSON.stringify({ name: "Work MacBook" }),
    );

    const { prefs } = await import("$lib/stores/prefs.svelte");
    expect(prefs.name).toBe("Work MacBook");
  });

  it("persists a name", async () => {
    const { prefs } = await import("$lib/stores/prefs.svelte");
    prefs.save({ name: "Work MacBook" });

    expect(prefs.name).toBe("Work MacBook");
    expect(JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY)!)).toEqual({
      name: "Work MacBook",
    });
  });

  it("persists an empty name", async () => {
    const { prefs } = await import("$lib/stores/prefs.svelte");
    prefs.save({ name: "Work MacBook" });
    prefs.save({ name: "" });

    expect(prefs.name).toBe("");
    expect(JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY)!)).toEqual({
      name: "",
    });
  });

  it("ignores malformed JSON", async () => {
    localStorage.setItem(PREFS_STORAGE_KEY, "not json");
    const { prefs } = await import("$lib/stores/prefs.svelte");
    expect(prefs.name).toBe("");
  });

  it("falls back to the default for fields that are missing", async () => {
    // e.g. a key written before `deviceName` was renamed to `name`
    localStorage.setItem(
      PREFS_STORAGE_KEY,
      JSON.stringify({ deviceName: "old name" }),
    );

    const { prefs } = await import("$lib/stores/prefs.svelte");
    expect(prefs.name).toBe("");
  });
});
