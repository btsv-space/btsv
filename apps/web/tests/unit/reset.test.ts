import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  LEGACY_AUTH_STORAGE_KEY,
  POSTS_LIST_PREFS_STORAGE_KEY,
  PROJECT_COMMITS_STORAGE_KEY,
  SYNC_STATUS_STORAGE_KEY,
} from "$lib/shared/constants";

const { mockClearAll, mockClearFS, mockReset, mockReload } = vi.hoisted(() => ({
  mockClearAll: vi.fn(),
  mockClearFS: vi.fn(),
  mockReset: vi.fn(),
  mockReload: vi.fn(),
}));

vi.mock("$lib/db", () => ({ dbClearAll: mockClearAll }));
vi.mock("$lib/fs", () => ({ clearFS: mockClearFS }));
vi.mock("$lib/stores/device.svelte", () => ({
  deviceLock: { reset: mockReset },
}));

const WIPED_KEYS = [
  LEGACY_AUTH_STORAGE_KEY,
  SYNC_STATUS_STORAGE_KEY,
  PROJECT_COMMITS_STORAGE_KEY,
  POSTS_LIST_PREFS_STORAGE_KEY,
];

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

beforeEach(() => {
  vi.resetModules();
  mockClearAll.mockReset().mockResolvedValue(undefined);
  mockClearFS.mockReset().mockResolvedValue(undefined);
  mockReset.mockReset();
  mockReload.mockReset();
  mockLocalStorage();
  Object.defineProperty(globalThis, "location", {
    value: { reload: mockReload },
    writable: true,
    configurable: true,
  });
});

describe("wipeLocalData", () => {
  it("resets the lock, clears every store and device key, then reloads", async () => {
    for (const key of WIPED_KEYS) localStorage.setItem(key, "x");

    const { wipeLocalData } = await import("$lib/reset");
    await wipeLocalData();

    expect(mockReset).toHaveBeenCalledOnce();
    expect(mockClearAll).toHaveBeenCalledOnce();
    expect(mockClearFS).toHaveBeenCalledOnce();
    for (const key of WIPED_KEYS) expect(localStorage.getItem(key)).toBeNull();
    expect(mockReload).toHaveBeenCalledOnce();
  });

  it("still clears the FS and reloads when IDB clearing fails", async () => {
    mockClearAll.mockRejectedValue(new Error("idb down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const { wipeLocalData } = await import("$lib/reset");
    await wipeLocalData();

    expect(mockClearFS).toHaveBeenCalledOnce();
    expect(mockReload).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("still reloads when FS clearing fails", async () => {
    mockClearFS.mockRejectedValue(new Error("fs down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const { wipeLocalData } = await import("$lib/reset");
    await wipeLocalData();

    expect(mockReload).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
