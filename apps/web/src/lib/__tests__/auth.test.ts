import { describe, it, expect, beforeEach, vi } from "vitest";
import { AUTH_STORAGE_KEY } from "$lib/shared/constants";
import type { IUser } from "$lib/shared/types";

vi.mock("$lib/sync/syncer", () => ({
  Syncer: function SyncerMock() {
    return {
      start: function () {},
      stop: function () {},
      addAfterSyncHook: function () {},
      pull: function () {},
    };
  },
}));

vi.mock("$lib/db", () => ({
  dbGetPrefs: vi.fn().mockResolvedValue(null),
  dbGetProjects: vi.fn().mockResolvedValue([]),
  dbSaveProjects: vi.fn().mockResolvedValue(undefined),
  dbSavePrefs: vi.fn().mockResolvedValue(undefined),
  dbGetPost: vi.fn().mockResolvedValue(null),
  dbGetPosts: vi.fn().mockResolvedValue([]),
  dbGetDirtyPosts: vi.fn().mockResolvedValue([]),
  dbDeletePost: vi.fn().mockResolvedValue(undefined),
  dbSavePost: vi.fn().mockResolvedValue(undefined),
}));

const TEST_USER: IUser = { id: "user-1", username: "testuser" };
const TEST_DEK_B64 = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";

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

function mockSessionStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
    writable: true,
  });
}

vi.mock("$app/navigation", () => ({
  goto: vi.fn(),
}));

async function importFreshAuth() {
  return import("$lib/stores/auth.svelte");
}

describe("auth store", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockLocalStorage();
    mockSessionStorage();
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  it("marks unauthenticated when no stored auth", async () => {
    const { ensureInit, isAuthenticated, currentUser, dek } =
      await importFreshAuth();
    await ensureInit();
    expect(isAuthenticated.value).toBe(false);
    expect(currentUser.value).toBeNull();
    expect(dek.value).toBeNull();
  });

  it("authenticates with valid session", async () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ dek: TEST_DEK_B64, user: TEST_USER }),
    );
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(TEST_USER),
    } as Response);

    const { ensureInit, isAuthenticated, currentUser, dek } =
      await importFreshAuth();
    await ensureInit();

    expect(isAuthenticated.value).toBe(true);
    expect(currentUser.value).toEqual(TEST_USER);
    expect(dek.value).toBeInstanceOf(Uint8Array);
  });

  it("authenticates offline with stored auth", async () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ dek: TEST_DEK_B64, user: TEST_USER }),
    );
    fetchSpy.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const { ensureInit, isAuthenticated, currentUser, dek } =
      await importFreshAuth();
    await ensureInit();

    expect(isAuthenticated.value).toBe(true);
    expect(currentUser.value).toEqual(TEST_USER);
    expect(dek.value).toBeInstanceOf(Uint8Array);
  });

  it("clears auth on 401", async () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ dek: TEST_DEK_B64, user: TEST_USER }),
    );
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "unauthorized" }),
    } as Response);

    const { ensureInit, isAuthenticated, currentUser, dek } =
      await importFreshAuth();
    await ensureInit();

    expect(isAuthenticated.value).toBe(false);
    expect(currentUser.value).toBeNull();
    expect(dek.value).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it("persistAuth stores auth and sets state", async () => {
    const { persistAuth, isAuthenticated, currentUser, dek } =
      await importFreshAuth();
    const dekValue = new Uint8Array(32).fill(1);

    persistAuth(TEST_USER, dekValue);

    expect(isAuthenticated.value).toBe(true);
    expect(currentUser.value).toEqual(TEST_USER);
    expect(dek.value).toBeInstanceOf(Uint8Array);
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toContain(TEST_DEK_B64);
  });

  it("logout clears stored auth and state", async () => {
    const { logout, persistAuth, isAuthenticated, currentUser, dek } =
      await importFreshAuth();
    const dekValue = new Uint8Array(32).fill(1);

    persistAuth(TEST_USER, dekValue);
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: () => Promise.resolve({}),
    } as Response);
    await logout();

    expect(isAuthenticated.value).toBe(false);
    expect(currentUser.value).toBeNull();
    expect(dek.value).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });
});
