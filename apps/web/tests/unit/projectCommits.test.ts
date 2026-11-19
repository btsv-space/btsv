import { describe, it, expect, beforeEach, vi } from "vitest";
import { PROJECT_COMMITS_STORAGE_KEY } from "$lib/shared/constants";

async function store() {
  return await import("$lib/stores/projectCommits.svelte");
}

describe("projectCommits", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it("has no recent project when nothing is recorded", async () => {
    const { projectCommits } = await store();
    expect(projectCommits.mostRecentProjectId).toBeNull();
  });

  it("hydrates from localStorage", async () => {
    localStorage.setItem(
      PROJECT_COMMITS_STORAGE_KEY,
      JSON.stringify({ a: 1, b: 2 }),
    );

    const { projectCommits } = await store();
    expect(projectCommits.mostRecentProjectId).toBe("b");
  });

  it("tracks the most recently synced project", async () => {
    const { projectCommits } = await store();

    projectCommits.set("a", 100);
    projectCommits.set("b", 200);
    expect(projectCommits.mostRecentProjectId).toBe("b");

    projectCommits.set("a", 300);
    expect(projectCommits.mostRecentProjectId).toBe("a");
  });

  it("exposes and persists a commit time", async () => {
    const { projectCommits } = await store();

    projectCommits.set("a", 42);

    expect(projectCommits.get("a")).toBe(42);
    expect(
      JSON.parse(localStorage.getItem(PROJECT_COMMITS_STORAGE_KEY) ?? "{}"),
    ).toEqual({ a: 42 });
  });

  it.each(["not json", "null"])("tolerates storage holding %s", async (raw) => {
    localStorage.setItem(PROJECT_COMMITS_STORAGE_KEY, raw);

    const { projectCommits } = await store();
    expect(projectCommits.mostRecentProjectId).toBeNull();
  });
});
