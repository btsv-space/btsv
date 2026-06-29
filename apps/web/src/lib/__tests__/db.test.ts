import { describe, it, expect, beforeAll } from "vitest";
import "fake-indexeddb/auto";
import { dbGetPosts, dbSavePost } from "$lib/db";
import type { IPostRecord } from "$lib/shared/types";

function makePost(
  id: string,
  projectId = "proj-1",
  overrides: Partial<IPostRecord> = {},
): IPostRecord {
  return {
    projectId,
    id,
    slug: "",
    title: "",
    dateCreated: "2026-01-01",
    dateUpdated: "2026-01-01",
    description: "",
    tags: [],
    draft: false,
    body: "",
    extra: {},
    dirty: false,
    ...overrides,
  };
}

async function seedProjects(): Promise<void> {
  for (let i = 1; i <= 20; i++) {
    await dbSavePost(makePost(`post-${String(i).padStart(2, "0")}`, "proj-1"));
  }
  for (let i = 1; i <= 5; i++) {
    await dbSavePost(makePost(`post-${String(i).padStart(2, "0")}`, "proj-2"));
  }
  await dbSavePost(
    makePost("post-01", "proj-full", {
      title: "My Title",
      body: "long body content",
      tags: ["a", "b"],
      description: "desc",
      draft: true,
    }),
  );
}

beforeAll(seedProjects);

describe("dbGetPosts", () => {
  it("returns first page (limit=5, offset=0) sorted by id desc", async () => {
    const page = await dbGetPosts("proj-1", { limit: 5, offset: 0 });
    expect(page).toHaveLength(5);
    expect(page.map((p) => p.id)).toEqual([
      "post-20",
      "post-19",
      "post-18",
      "post-17",
      "post-16",
    ]);
  });

  it("returns middle page (offset > 0)", async () => {
    const page = await dbGetPosts("proj-1", { limit: 5, offset: 5 });
    expect(page.map((p) => p.id)).toEqual([
      "post-15",
      "post-14",
      "post-13",
      "post-12",
      "post-11",
    ]);
  });

  it("uses cursor.advance to skip offset (not per-row continue)", async () => {
    const page = await dbGetPosts("proj-1", { limit: 5, offset: 18 });
    expect(page.map((p) => p.id)).toEqual(["post-02", "post-01"]);
  });

  it("returns [] when offset exceeds total", async () => {
    const page = await dbGetPosts("proj-2", { limit: 5, offset: 20 });
    expect(page).toEqual([]);
  });

  it("only returns posts for the given projectId", async () => {
    const proj1 = await dbGetPosts("proj-1");
    expect(proj1).toHaveLength(20);
    expect(proj1.every((p) => p.projectId === "proj-1")).toBe(true);

    const proj2 = await dbGetPosts("proj-2");
    expect(proj2).toHaveLength(5);
    expect(proj2.every((p) => p.projectId === "proj-2")).toBe(true);
  });

  it("unbounded call returns all posts sorted by id desc (getAll+reverse path)", async () => {
    const all = await dbGetPosts("proj-1");
    expect(all.map((p) => p.id)).toEqual(
      Array.from(
        { length: 20 },
        (_, i) => `post-${String(20 - i).padStart(2, "0")}`,
      ),
    );
  });

  it("returns [] for a project with no posts", async () => {
    const page = await dbGetPosts("proj-empty", { limit: 5, offset: 0 });
    expect(page).toEqual([]);
  });

  it("preserves full IPostRecord content (not just metadata)", async () => {
    const page = await dbGetPosts("proj-full", { limit: 5, offset: 0 });
    expect(page).toHaveLength(1);
    expect(page[0].title).toBe("My Title");
    expect(page[0].body).toBe("long body content");
    expect(page[0].tags).toEqual(["a", "b"]);
    expect(page[0].description).toBe("desc");
    expect(page[0].draft).toBe(true);
  });

  it("respects limit when fewer records requested than available", async () => {
    const page = await dbGetPosts("proj-1", { limit: 3, offset: 0 });
    expect(page).toHaveLength(3);
    expect(page.map((p) => p.id)).toEqual(["post-20", "post-19", "post-18"]);
  });

  it("unbounded call with offset is consistent with bounded slice of same offset", async () => {
    const all = await dbGetPosts("proj-1");
    const sliced = await dbGetPosts("proj-1", { limit: 5, offset: 10 });
    expect(sliced).toEqual(all.slice(10, 15));
  });
});
