import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TProjectEntry } from "$lib/shared/types";

const { mockCheckProjectDirExists, mockDbGetProjects } = vi.hoisted(() => ({
  mockCheckProjectDirExists: vi.fn(),
  mockDbGetProjects: vi.fn(),
}));

vi.mock("$lib/fs", () => ({
  checkProjectDirExists: mockCheckProjectDirExists,
}));

vi.mock("$lib/db", () => ({
  dbGetProjects: mockDbGetProjects,
}));

function makeProject(overrides: Partial<TProjectEntry> = {}): TProjectEntry {
  return {
    id: "proj-1",
    name: "Test Project",
    repoUrl: "https://github.com/test/test.git",
    status: "unknown",
    error: "",
    ...overrides,
  };
}

describe("ensureProjectsHydrated", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCheckProjectDirExists.mockReset();
    mockCheckProjectDirExists.mockResolvedValue(false);
    mockDbGetProjects.mockReset();
  });

  it("hydrates from the IDB cache when the store is empty", async () => {
    mockDbGetProjects.mockResolvedValue([
      makeProject({ storedRemoteSha: "sha-1" }),
    ]);
    const { projects, ensureProjectsHydrated } =
      await import("$lib/stores/projects.svelte");
    await ensureProjectsHydrated();
    expect(projects.value).toHaveLength(1);
    expect(projects.value[0].status).toBe("ready");
  });

  it("does not re-read the cache when the store is populated", async () => {
    mockDbGetProjects.mockResolvedValue([makeProject()]);
    const { projects, ensureProjectsHydrated } =
      await import("$lib/stores/projects.svelte");
    await ensureProjectsHydrated();
    expect(mockDbGetProjects).toHaveBeenCalledTimes(1);
    expect(projects.value).toHaveLength(1);

    await ensureProjectsHydrated();
    expect(mockDbGetProjects).toHaveBeenCalledTimes(1);
    expect(projects.value).toHaveLength(1);
  });

  it("re-reads the cache after the store is emptied (re-login path)", async () => {
    mockDbGetProjects.mockResolvedValue([makeProject({ id: "proj-old" })]);
    const { projects, ensureProjectsHydrated } =
      await import("$lib/stores/projects.svelte");
    await ensureProjectsHydrated();
    expect(projects.value.map((p) => p.id)).toEqual(["proj-old"]);

    // simulate logout (store emptied, IDB intact) + re-login
    projects.value = [];
    mockDbGetProjects.mockResolvedValue([makeProject({ id: "proj-new" })]);
    await ensureProjectsHydrated();
    expect(projects.value.map((p) => p.id)).toEqual(["proj-new"]);
  });

  it("shares the in-flight hydration across concurrent callers", async () => {
    let resolveProjects!: (v: TProjectEntry[]) => void;
    mockDbGetProjects.mockReturnValue(
      new Promise((r) => {
        resolveProjects = r;
      }),
    );
    const { ensureProjectsHydrated } =
      await import("$lib/stores/projects.svelte");
    const first = ensureProjectsHydrated();
    const second = ensureProjectsHydrated();
    resolveProjects([makeProject()]);
    await Promise.all([first, second]);
    expect(mockDbGetProjects).toHaveBeenCalledTimes(1);
  });
});

describe("projectEntryWithStatus", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCheckProjectDirExists.mockReset();
    mockDbGetProjects.mockReset();
    mockDbGetProjects.mockResolvedValue([]);
  });

  it("dir exists → ready (git-sync path)", async () => {
    mockCheckProjectDirExists.mockResolvedValue(true);
    const { projectEntryWithStatus } =
      await import("$lib/stores/projects.svelte");
    const entry = await projectEntryWithStatus(makeProject());
    expect(entry.status).toBe("ready");
  });

  it("no dir + storedRemoteSha → ready (API-sync reload path)", async () => {
    mockCheckProjectDirExists.mockResolvedValue(false);
    const { projectEntryWithStatus } =
      await import("$lib/stores/projects.svelte");
    const entry = await projectEntryWithStatus(
      makeProject({ storedRemoteSha: "sha-1" }),
    );
    expect(entry.status).toBe("ready");
  });

  it("no dir + no storedRemoteSha → unknown (new-device path)", async () => {
    mockCheckProjectDirExists.mockResolvedValue(false);
    const { projectEntryWithStatus } =
      await import("$lib/stores/projects.svelte");
    const entry = await projectEntryWithStatus(makeProject());
    expect(entry.status).toBe("unknown");
  });
});
