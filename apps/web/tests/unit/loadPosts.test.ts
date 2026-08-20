import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IPostsListPrefs, TProjectEntry } from "$lib/shared/types";

const { mockDbGetPosts, mockDbGetProjects, mockSyncerPull } = vi.hoisted(
  () => ({
    mockDbGetPosts: vi.fn(),
    mockDbGetProjects: vi.fn(),
    mockSyncerPull: vi.fn(),
  }),
);

vi.mock("$lib/db", () => ({
  dbGetPosts: mockDbGetPosts,
  dbGetProjects: mockDbGetProjects,
  dbGetPost: vi.fn(),
  dbSaveProject: vi.fn(),
  dbGetPrefs: vi.fn().mockResolvedValue(undefined),
  dbGetDirtyPosts: vi.fn().mockResolvedValue([]),
}));

vi.mock("$lib/fs", () => ({
  checkProjectDirExists: vi.fn().mockResolvedValue(false),
}));

// The real Syncer pulls in fs/parser/crypto/api; loadPosts never touches it
// with pullOption "never", so a stub is enough (module level calls
// addAfterSyncHook once).
vi.mock("$lib/sync/syncer", () => ({
  Syncer: class {
    addAfterSyncHook() {}
    pull = mockSyncerPull;
  },
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

function makeProject(): TProjectEntry {
  return {
    id: "proj-1",
    name: "Test Project",
    repoUrl: "https://github.com/test/test.git",
    status: "ready",
    error: "",
  };
}

describe("loadPosts", () => {
  beforeEach(async () => {
    vi.resetModules();
    mockLocalStorage();
    mockDbGetPosts.mockReset();
    mockDbGetPosts.mockResolvedValue([]);
    mockDbGetProjects.mockReset();
    // default: empty cache → store hydration is a no-op; seed manually below
    mockDbGetProjects.mockResolvedValue([]);
    mockSyncerPull.mockReset();
    mockSyncerPull.mockResolvedValue([]);
    const { projects } = await import("$lib/stores/projects.svelte");
    projects.value = [makeProject()];
  });

  it("forwards listPrefs to dbGetPosts", async () => {
    const { loadPosts } = await import("$lib/stores/syncer.svelte");
    const listPrefs: IPostsListPrefs = {
      sort: "dateUpdated",
      order: "asc",
      draft: "all",
      page: "all",
    };

    await loadPosts("proj-1", { pullOption: "never", page: 2, listPrefs });

    expect(mockDbGetPosts).toHaveBeenCalledWith("proj-1", {
      limit: 15,
      offset: 15,
      listPrefs,
    });
  });

  it("passes listPrefs: undefined when not provided (dbGetPosts applies defaults)", async () => {
    const { loadPosts } = await import("$lib/stores/syncer.svelte");

    await loadPosts("proj-1", { pullOption: "never", page: 1 });

    expect(mockDbGetPosts).toHaveBeenCalledWith("proj-1", {
      limit: 15,
      offset: 0,
      listPrefs: undefined,
    });
  });

  it("waits for projects hydration before reading (reload race)", async () => {
    // fresh module registry so the store's hydration re-runs with a
    // manually-deferred dbGetProjects
    vi.resetModules();
    let resolveProjects!: (v: TProjectEntry[]) => void;
    mockDbGetProjects.mockReturnValue(
      new Promise((r) => {
        resolveProjects = r;
      }),
    );
    const { loadPosts } = await import("$lib/stores/syncer.svelte");

    let settled = false;
    const pending = loadPosts("proj-1", { pullOption: "never", page: 1 }).then(
      (r) => {
        settled = true;
        return r;
      },
    );

    // drain the microtask queue + one macrotask: loadPosts must still be
    // gated on hydration (no premature "project not found" empty return)
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).toBe(false);

    resolveProjects([makeProject()]);
    await pending;
    expect(settled).toBe(true);
    expect(mockDbGetPosts).toHaveBeenCalledWith("proj-1", {
      limit: 15,
      offset: 0,
      listPrefs: undefined,
    });
  });

  it("loadPost with forcePull pulls via the syncer after hydration", async () => {
    vi.resetModules();
    mockDbGetProjects.mockResolvedValue([makeProject()]);
    const { loadPost } = await import("$lib/stores/syncer.svelte");

    await loadPost("proj-1", "post-1", { forcePull: true });

    expect(mockSyncerPull).toHaveBeenCalledTimes(1);
    expect(mockSyncerPull).toHaveBeenCalledWith(
      expect.objectContaining({ id: "proj-1" }),
    );
  });
});
