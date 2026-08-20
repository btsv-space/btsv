import { describe, it, expect, beforeEach, vi } from "vitest";
import { DEFAULT_LIST_PREFS } from "$lib/postsList";

const STORAGE_KEY = "btsv:postsListPrefs";

function mockLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
    writable: true,
  });
}

async function importFreshStore() {
  return import("$lib/stores/postsListPrefs.svelte");
}

describe("postsListPrefs store", () => {
  beforeEach(() => {
    vi.resetModules();
    mockLocalStorage();
  });

  it("returns defaults for a project with no stored prefs", async () => {
    const { postsListPrefs } = await importFreshStore();
    expect(postsListPrefs.get("proj-1")).toEqual(DEFAULT_LIST_PREFS);
  });

  it("set/get round-trip and persists to localStorage", async () => {
    const { postsListPrefs } = await importFreshStore();
    const prefs = {
      sort: "dateUpdated" as const,
      order: "asc" as const,
      draft: "published" as const,
      page: "posts" as const,
    };
    postsListPrefs.set("proj-1", prefs);

    expect(postsListPrefs.get("proj-1")).toEqual(prefs);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      "proj-1": prefs,
    });
  });

  it("keeps prefs isolated per project", async () => {
    const { postsListPrefs } = await importFreshStore();
    postsListPrefs.set("proj-1", { ...DEFAULT_LIST_PREFS, order: "asc" });

    expect(postsListPrefs.get("proj-1")?.order).toBe("asc");
    expect(postsListPrefs.get("proj-2")).toEqual(DEFAULT_LIST_PREFS);
  });

  it("hydrates persisted prefs on fresh import", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        "proj-1": {
          sort: "datePublished",
          order: "asc",
          draft: "all",
          page: "pages",
        },
      }),
    );

    const { postsListPrefs } = await importFreshStore();
    expect(postsListPrefs.get("proj-1")).toEqual({
      sort: "datePublished",
      order: "asc",
      draft: "all",
      page: "pages",
    });
  });

  it("falls back to defaults on corrupted localStorage JSON", async () => {
    localStorage.setItem(STORAGE_KEY, "{not json");

    const { postsListPrefs } = await importFreshStore();
    expect(postsListPrefs.get("proj-1")).toEqual(DEFAULT_LIST_PREFS);
  });

  it("sanitizes invalid enum values in stored payload per-field", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        "proj-1": {
          sort: "title",
          order: "asc",
          draft: "maybe",
          page: "pages",
        },
      }),
    );

    const { postsListPrefs } = await importFreshStore();
    expect(postsListPrefs.get("proj-1")).toEqual({
      sort: DEFAULT_LIST_PREFS.sort, // invalid → default
      order: "asc",
      draft: DEFAULT_LIST_PREFS.draft, // invalid → default
      page: "pages",
    });
  });

  it("fills missing fields in older stored payloads with defaults", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ "proj-1": { sort: "dateUpdated" } }),
    );

    const { postsListPrefs } = await importFreshStore();
    expect(postsListPrefs.get("proj-1")).toEqual({
      ...DEFAULT_LIST_PREFS,
      sort: "dateUpdated",
    });
  });
});
