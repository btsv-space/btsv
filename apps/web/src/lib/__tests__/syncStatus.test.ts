import { describe, it, expect, beforeEach, vi } from "vitest";
import { SyncState } from "$lib/shared/types";

const STORAGE_KEY = "btsv:syncStatus";

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
  return import("$lib/stores/syncStatus.svelte");
}

describe("syncStatus store", () => {
  beforeEach(() => {
    vi.resetModules();
    mockLocalStorage();
  });

  it("persists status to localStorage on set", async () => {
    const { syncStatus } = await importFreshStore();
    syncStatus.set("proj-1", { state: SyncState.ERROR, errorMsg: "failed" });

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({
      "proj-1": { state: SyncState.ERROR, errorMsg: "failed" },
    });
  });

  it("reads persisted status on fresh import", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        "proj-1": { state: SyncState.ERROR, errorMsg: "bad" },
      }),
    );

    const { syncStatus } = await importFreshStore();
    expect(syncStatus.get("proj-1")?.state).toBe(SyncState.ERROR);
    expect(syncStatus.get("proj-1")?.errorMsg).toBe("bad");
  });

  it("clears localStorage on clear", async () => {
    const { syncStatus } = await importFreshStore();
    syncStatus.set("proj-1", { state: SyncState.ERROR, errorMsg: "failed" });
    syncStatus.clear();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(syncStatus.get("proj-1")).toBeUndefined();
  });

  it("resets persisted SYNCING states to SYNCED on load", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        "proj-1": { state: SyncState.SYNCING_PULL, errorMsg: "" },
        "proj-2": { state: SyncState.SYNCING_PUSH, errorMsg: "" },
        "proj-3": { state: SyncState.ERROR, errorMsg: "bad" },
      }),
    );

    const { syncStatus } = await importFreshStore();
    expect(syncStatus.get("proj-1")?.state).toBe(SyncState.SYNCED);
    expect(syncStatus.get("proj-2")?.state).toBe(SyncState.SYNCED);
    expect(syncStatus.get("proj-3")?.state).toBe(SyncState.ERROR);
  });
});
