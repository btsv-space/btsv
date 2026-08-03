import { describe, it, expect, beforeAll } from "vitest";
import "fake-indexeddb/auto";
import {
  dbGetPosts,
  dbSavePost,
  dbGetDirtyPosts,
  dbGetPostPage,
} from "$lib/db";
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
    page: false,
    body: "",
    extra: {},
    dirty: 0,
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
  // Dirty posts for by_project_dirty index coverage
  await dbSavePost(makePost("post-01", "proj-1", { dirty: 1 }));
  await dbSavePost(makePost("post-02", "proj-1", { dirty: 1 }));
  await dbSavePost(makePost("post-01", "proj-2", { dirty: 1 }));
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

describe("dbGetPostPage", () => {
  beforeAll(async () => {
    // 12 posts in "proj-page" (ids post-01..post-12) plus one tombstone
    // whose id ("post-tomb") sorts above all of them.
    for (let i = 1; i <= 12; i++) {
      await dbSavePost(
        makePost(`post-${String(i).padStart(2, "0")}`, "proj-page"),
      );
    }
    await dbSavePost(makePost("post-tomb", "proj-page", { deleted: true }));
    await dbSavePost(makePost("post-01", "proj-page-2"));
  });

  it("returns page 1 for the newest post", async () => {
    // rank 1 (only the tombstone sorts above it) -> page 1
    expect(await dbGetPostPage("proj-page", "post-12", 5)).toBe(1);
  });

  it("returns page 1 for a post within the first page", async () => {
    // rank 6 -> page 2; without the tombstone rank would be 5 -> page 1
    expect(await dbGetPostPage("proj-page", "post-08", 5)).toBe(2);
  });

  it("returns page 2 at the page boundary", async () => {
    expect(await dbGetPostPage("proj-page", "post-07", 5)).toBe(2);
  });

  it("returns page 3 for the oldest post", async () => {
    expect(await dbGetPostPage("proj-page", "post-02", 5)).toBe(3);
  });

  it("pages are scoped to the project", async () => {
    // same id, different project, different result
    expect(await dbGetPostPage("proj-page-2", "post-01", 5)).toBe(1);
    expect(await dbGetPostPage("proj-page", "post-01", 5)).toBe(3);
  });

  it("returns page 1 for an unknown id that sorts above everything", async () => {
    expect(await dbGetPostPage("proj-page", "post-99", 5)).toBe(1);
    expect(await dbGetPostPage("proj-page", "zzz", 5)).toBe(1);
  });

  it("returns page 1 for a project with no posts", async () => {
    expect(await dbGetPostPage("proj-empty", "post-01", 5)).toBe(1);
  });
});

describe("dbGetDirtyPosts", () => {
  it("returns only dirty posts for the given project", async () => {
    const dirty = await dbGetDirtyPosts("proj-1");
    expect(dirty).toHaveLength(2);
    expect(dirty.map((p) => p.id).sort()).toEqual(["post-01", "post-02"]);
    expect(dirty.every((p) => p.dirty === 1)).toBe(true);
  });

  it("returns [] for a project with no dirty posts", async () => {
    await dbSavePost(makePost("post-99", "proj-empty", { dirty: 0 }));
    const dirty = await dbGetDirtyPosts("proj-empty");
    expect(dirty).toEqual([]);
  });

  it("does not leak dirty posts from other projects", async () => {
    const dirty2 = await dbGetDirtyPosts("proj-2");
    expect(dirty2).toHaveLength(1);
    expect(dirty2[0].id).toBe("post-01");
    expect(dirty2[0].projectId).toBe("proj-2");
  });
});
