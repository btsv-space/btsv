import { describe, it, expect, vi, beforeEach } from "vitest";
import { AUTH_STORAGE_KEY } from "$lib/shared/constants";

const { mockGoto, mockMe } = vi.hoisted(() => ({
  mockGoto: vi.fn(),
  mockMe: vi.fn(),
}));

vi.mock("$app/environment", () => ({ browser: true }));
vi.mock("$app/navigation", () => ({ goto: mockGoto }));
vi.mock("$lib/api", () => ({ api: { auth: { me: mockMe } } }));
vi.mock("$lib/stores/syncer.svelte", () => ({
  syncer: { stop: vi.fn() },
  canSync: { value: false },
}));
vi.mock("$lib/stores/prefs.svelte", () => ({ prefs: { value: {} } }));
vi.mock("$lib/stores/projects.svelte", () => ({ projects: { value: [] } }));
vi.mock("$lib/stores/syncStatus.svelte", () => ({
  syncStatus: { clear: vi.fn() },
}));

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

const VALID_DEK_B64 = btoa(String.fromCharCode(...new Uint8Array(32).fill(1)));

function seedAuth(dek: string) {
  localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({ dek, user: { id: "u1", username: "u" } }),
  );
}

describe("auth module-scope init", () => {
  beforeEach(() => {
    vi.resetModules();
    mockLocalStorage();
    mockGoto.mockReset();
    mockMe.mockReset();
  });

  it("valid stored auth → authenticated synchronously on import, background verify fires", async () => {
    seedAuth(VALID_DEK_B64);
    mockMe.mockResolvedValue({ id: "u1", username: "u" });

    const { isAuthenticated, currentUser } =
      await import("$lib/stores/auth.svelte");

    expect(isAuthenticated.value).toBe(true);
    expect(currentUser.value?.username).toBe("u");
    expect(mockMe).toHaveBeenCalled();
  });

  it("empty localStorage → unauthenticated, no server check", async () => {
    const { isAuthenticated } = await import("$lib/stores/auth.svelte");

    expect(isAuthenticated.value).toBe(false);
    expect(mockMe).not.toHaveBeenCalled();
  });

  it("corrupt JSON → unauthenticated and the key is cleared", async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, "{not json");

    const { isAuthenticated } = await import("$lib/stores/auth.svelte");

    expect(isAuthenticated.value).toBe(false);
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it("invalid DEK base64 → unauthenticated and the key is cleared", async () => {
    seedAuth("!!!not-base64!!!");

    const { isAuthenticated } = await import("$lib/stores/auth.svelte");

    expect(isAuthenticated.value).toBe(false);
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });
});
