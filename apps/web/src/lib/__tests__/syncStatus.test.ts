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

const mockGetDirtyPosts = vi.fn<(projectId: string) => Promise<unknown[]>>();

async function importFreshStore() {
  vi.doMock("$lib/db", () => ({
    dbGetDirtyPosts: (pid: string) => mockGetDirtyPosts(pid),
  }));
  return import("$lib/stores/syncStatus.svelte");
}

describe("syncStatus store", () => {
  beforeEach(() => {
    vi.resetModules();
    mockLocalStorage();
    mockGetDirtyPosts.mockReset();
    // By default, no dirty posts anywhere (hydrate is a no-op).
    mockGetDirtyPosts.mockResolvedValue([]);
  });

  it("persists state + errorMsg via setStateAndMsg; dirty omitted from localStorage", async () => {
    const { syncStatus } = await importFreshStore();
    syncStatus.setStateAndMsg("proj-1", {
      state: SyncState.ERROR,
      errorMsg: "failed",
    });

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({
      "proj-1": { state: SyncState.ERROR, errorMsg: "failed" },
    });
    // `dirty` is in-memory only:
    expect(syncStatus.get("proj-1")?.dirty).toBe(false);
  });

  it("reads persisted state + errorMsg on fresh import; dirty defaults to false", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        "proj-1": { state: SyncState.ERROR, errorMsg: "bad" },
      }),
    );

    const { syncStatus } = await importFreshStore();
    expect(syncStatus.get("proj-1")?.state).toBe(SyncState.ERROR);
    expect(syncStatus.get("proj-1")?.errorMsg).toBe("bad");
    expect(syncStatus.get("proj-1")?.dirty).toBe(false);
  });

  it("strips stale `dirty` from persisted JSON and doesn't trust it on load", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        "proj-1": {
          state: SyncState.SYNCED,
          errorMsg: "",
          dirty: true,
        },
      }),
    );

    const { syncStatus } = await importFreshStore();
    // Stale dirty=true is discarded; #hydrate recomputes from IDB instead.
    expect(syncStatus.get("proj-1")?.dirty).toBe(false);
  });

  it("clears localStorage on clear", async () => {
    const { syncStatus } = await importFreshStore();
    syncStatus.setStateAndMsg("proj-1", {
      state: SyncState.ERROR,
      errorMsg: "failed",
    });
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

  it("setStateAndMsg preserves in-memory dirty across state changes", async () => {
    const { syncStatus } = await importFreshStore();

    // Create the entry first, then mark dirty.
    syncStatus.setStateAndMsg("proj-1", {
      state: SyncState.SYNCED,
      errorMsg: "",
    });
    syncStatus.updateDirty("proj-1", true);
    expect(syncStatus.get("proj-1")?.dirty).toBe(true);

    syncStatus.setStateAndMsg("proj-1", {
      state: SyncState.SYNCING_PUSH,
      errorMsg: "",
    });
    expect(syncStatus.get("proj-1")?.state).toBe(SyncState.SYNCING_PUSH);
    expect(syncStatus.get("proj-1")?.dirty).toBe(true);

    // localStorage persisted shape excludes dirty:
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      "proj-1": { state: SyncState.SYNCING_PUSH, errorMsg: "" },
    });
  });

  it("get returns undefined for projects with no entry", async () => {
    const { syncStatus } = await importFreshStore();
    expect(syncStatus.get("proj-unknown")).toBeUndefined();
  });

  it("updateDirty does not create entries for unknown projects", async () => {
    const { syncStatus } = await importFreshStore();
    syncStatus.updateDirty("proj-1", true);
    // updateDirty is a no-op when no entry exists — get should still be undefined.
    expect(syncStatus.get("proj-1")).toBeUndefined();
  });

  it("constructor hydrates dirty from IDB for known projects (fire-and-forget)", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        "proj-1": { state: SyncState.SYNCED, errorMsg: "" },
        "proj-2": { state: SyncState.SYNCED, errorMsg: "" },
      }),
    );
    // proj-1 has dirty posts; proj-2 is clean.
    mockGetDirtyPosts.mockImplementation((pid: string) =>
      Promise.resolve(pid === "proj-1" ? (["dummy"] as unknown[]) : []),
    );

    const { syncStatus } = await importFreshStore();
    // Hydrate fires async dbGetDirtyPosts — drain microtasks.
    await Promise.resolve();
    await Promise.resolve();

    expect(syncStatus.get("proj-1")?.dirty).toBe(true);
    expect(syncStatus.get("proj-2")?.dirty).toBe(false);
  });

  it("constructor hydrate does NOT create entries for projects absent from localStorage", async () => {
    // No localStorage entries; only dbGetDirtyPosts would seed entries.
    mockGetDirtyPosts.mockImplementation((pid: string) =>
      Promise.resolve(pid === "proj-9" ? (["dummy"] as unknown[]) : []),
    );

    const { syncStatus } = await importFreshStore();
    await Promise.resolve();
    await Promise.resolve();

    // No `proj-9` entry was created via hydrate; only entry creation comes
    // from setStateAndMsg.
    expect(syncStatus.get("proj-9")).toBeUndefined();
  });

  it("updateDirty with override sets dirty synchronously", async () => {
    const { syncStatus } = await importFreshStore();
    syncStatus.setStateAndMsg("proj-1", {
      state: SyncState.SYNCED,
      errorMsg: "",
    });
    syncStatus.updateDirty("proj-1", true);
    expect(syncStatus.get("proj-1")?.dirty).toBe(true);
  });

  it("updateDirty with null override relies on IDB for dirty flag", async () => {
    const { syncStatus } = await importFreshStore();
    syncStatus.setStateAndMsg("proj-1", {
      state: SyncState.SYNCED,
      errorMsg: "",
    });

    // No override — the async IDB query (mockGetDirtyPosts returns []) will
    // reconcile dirty to false.
    syncStatus.updateDirty("proj-1", null);

    // Until the microtask drains, dirty retains the existing value (false
    // from setStateAndMsg default).
    expect(syncStatus.get("proj-1")?.dirty).toBe(false);

    // Drain microtask so the IDB promise resolves.
    await Promise.resolve();
    expect(syncStatus.get("proj-1")?.dirty).toBe(false);
  });

  it("updateDirty async IDB reconciliation flips dirty when IDB has posts", async () => {
    const { syncStatus } = await importFreshStore();
    syncStatus.setStateAndMsg("proj-1", {
      state: SyncState.SYNCED,
      errorMsg: "",
    });

    // Set the mock to return dirty posts for proj-1.
    mockGetDirtyPosts.mockResolvedValue(["dirty-post-id" as unknown]);

    syncStatus.updateDirty("proj-1", null);
    expect(syncStatus.get("proj-1")?.dirty).toBe(false);

    await Promise.resolve();
    expect(syncStatus.get("proj-1")?.dirty).toBe(true);
  });
});
