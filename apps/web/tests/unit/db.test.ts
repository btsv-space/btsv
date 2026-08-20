import { describe, it, expect, beforeAll } from "vitest";
import "fake-indexeddb/auto";
import {
  dbGetPosts,
  dbSavePost,
  dbGetDirtyPosts,
  dbGetPostPage,
  dbGetProjectTags,
} from "$lib/db";
import type { IPostRecord, IPostsListPrefs } from "$lib/shared/types";
import { DEFAULT_LIST_PREFS } from "$lib/postsList";

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

function listPrefs(overrides: Partial<IPostsListPrefs> = {}): IPostsListPrefs {
  return { ...DEFAULT_LIST_PREFS, ...overrides };
}

const ids = (posts: IPostRecord[]) => posts.map((p) => p.id);

// proj-sort: varied dates so each sort field produces a distinct order, and
// id order deliberately disagrees with dateCreated order (s-02 vs s-03) to
// prove sorting follows the date field, not the id.
async function seedSortFixtures(): Promise<void> {
  const p = (
    id: string,
    dateCreated: string,
    dateUpdated: string,
    overrides: Partial<IPostRecord> = {},
  ) =>
    dbSavePost(
      makePost(id, "proj-sort", { dateCreated, dateUpdated, ...overrides }),
    );

  await p("s-01", "2026-01-10", "2026-03-01", { datePublished: "2026-01-11" });
  await p("s-02", "2026-01-20", "2026-02-15", { datePublished: "2026-01-21" });
  await p("s-03", "2026-01-15", "2026-02-20", { datePublished: "2026-01-16" });
  // never-published draft (no datePublished → absent from that index)
  await p("s-04", "2026-01-25", "2026-01-25", { draft: true });
  // once-published-then-unpublished draft (retains datePublished)
  await p("s-05", "2026-01-12", "2026-02-10", {
    datePublished: "2026-01-13",
    draft: true,
  });
  await p("s-06", "2026-01-18", "2026-02-05", {
    datePublished: "2026-01-19",
    page: true,
  });
  // tombstone — in the indexes but excluded by the predicate
  await p("s-07", "2026-01-22", "2026-02-25", {
    datePublished: "2026-01-23",
    deleted: true,
  });

  // missing dateUpdated — invisible to the updated-sort index (documented
  // limitation for malformed records)
  const noUpdated = { ...makePost("s-nd", "proj-nodate") } as Record<
    string,
    unknown
  >;
  delete noUpdated.dateUpdated;
  await dbSavePost(noUpdated as unknown as IPostRecord);
}

beforeAll(async () => {
  await seedProjects();
  await seedSortFixtures();
});

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

  it("returns the final partial page when offset is near the total", async () => {
    const page = await dbGetPosts("proj-1", { limit: 5, offset: 18 });
    expect(page.map((p) => p.id)).toEqual(["post-02", "post-01"]);
  });

  it("returns [] when offset exceeds total", async () => {
    const page = await dbGetPosts("proj-2", { limit: 5, offset: 20 });
    expect(page).toEqual([]);
  });

  it("only returns posts for the given projectId", async () => {
    const proj1 = await dbGetPosts("proj-1", { limit: 100 });
    expect(proj1).toHaveLength(20);
    expect(proj1.every((p) => p.projectId === "proj-1")).toBe(true);

    const proj2 = await dbGetPosts("proj-2", { limit: 100 });
    expect(proj2).toHaveLength(5);
    expect(proj2.every((p) => p.projectId === "proj-2")).toBe(true);
  });

  it("large limit returns all posts sorted by id desc (same-day ties)", async () => {
    // All seeded posts share dateCreated=2026-01-01, so the dateCreated
    // index ties break by primary key following the cursor direction
    // (id desc under "prev").
    const all = await dbGetPosts("proj-1", { limit: 100 });
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

  it("paged slices are consistent with one large-limit read", async () => {
    const all = await dbGetPosts("proj-1", { limit: 100 });
    const sliced = await dbGetPosts("proj-1", { limit: 5, offset: 10 });
    expect(sliced).toEqual(all.slice(10, 15));
  });
});

describe("dbGetPostPage", () => {
  beforeAll(async () => {
    // 12 posts in "proj-page" (ids post-01..post-12) plus one tombstone
    // ("post-tomb"). The tombstone is excluded by the predicate, so it does
    // not shift page numbers.
    for (let i = 1; i <= 12; i++) {
      await dbSavePost(
        makePost(`post-${String(i).padStart(2, "0")}`, "proj-page"),
      );
    }
    await dbSavePost(makePost("post-tomb", "proj-page", { deleted: true }));
    await dbSavePost(makePost("post-01", "proj-page-2"));
  });

  it("returns page 1 for the newest post", async () => {
    expect(await dbGetPostPage("proj-page", "post-12", 5)).toBe(1);
  });

  it("returns page 1 for a post within the first page", async () => {
    // position 4 (post-12..post-09 before it); the tombstone is not counted
    expect(await dbGetPostPage("proj-page", "post-08", 5)).toBe(1);
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

  it("returns null for unknown ids", async () => {
    expect(await dbGetPostPage("proj-page", "post-99", 5)).toBeNull();
    expect(await dbGetPostPage("proj-page", "zzz", 5)).toBeNull();
  });

  it("returns null for a deleted post (excluded by the predicate)", async () => {
    expect(await dbGetPostPage("proj-page", "post-tomb", 5)).toBeNull();
  });

  it("returns null for a project with no posts", async () => {
    expect(await dbGetPostPage("proj-empty", "post-01", 5)).toBeNull();
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

describe("dbGetPosts sort/filter", () => {
  it("default prefs: created-desc, tombstone excluded, full pages", async () => {
    const page = await dbGetPosts("proj-sort", { limit: 10 });
    expect(ids(page)).toEqual(["s-04", "s-02", "s-06", "s-03", "s-05", "s-01"]);
  });

  it("sorts by dateCreated asc", async () => {
    const page = await dbGetPosts("proj-sort", {
      limit: 10,
      listPrefs: listPrefs({ order: "asc" }),
    });
    expect(ids(page)).toEqual(["s-01", "s-05", "s-03", "s-06", "s-02", "s-04"]);
  });

  it("sorts by dateUpdated desc/asc", async () => {
    const desc = await dbGetPosts("proj-sort", {
      limit: 10,
      listPrefs: listPrefs({ sort: "dateUpdated" }),
    });
    expect(ids(desc)).toEqual(["s-01", "s-03", "s-02", "s-05", "s-06", "s-04"]);

    const asc = await dbGetPosts("proj-sort", {
      limit: 10,
      listPrefs: listPrefs({ sort: "dateUpdated", order: "asc" }),
    });
    expect(ids(asc)).toEqual(["s-04", "s-06", "s-05", "s-02", "s-03", "s-01"]);
  });

  it("full-precision dateUpdated orders same-day posts by time", async () => {
    // mixed precision is prefix-safe: the legacy day-precision value sorts
    // as start-of-day
    await dbSavePost(
      makePost("fp-1", "proj-precision", {
        dateCreated: "2026-08-19T09:00:00Z",
        dateUpdated: "2026-08-19T09:00:00Z",
      }),
    );
    await dbSavePost(
      makePost("fp-2", "proj-precision", {
        dateCreated: "2026-08-19",
        dateUpdated: "2026-08-19T14:30:22Z",
      }),
    );
    await dbSavePost(
      makePost("fp-3", "proj-precision", {
        dateCreated: "2026-08-19",
        dateUpdated: "2026-08-19",
      }),
    );

    const desc = await dbGetPosts("proj-precision", {
      limit: 10,
      listPrefs: listPrefs({ sort: "dateUpdated" }),
    });
    expect(ids(desc)).toEqual(["fp-2", "fp-1", "fp-3"]);

    const asc = await dbGetPosts("proj-precision", {
      limit: 10,
      listPrefs: listPrefs({ sort: "dateUpdated", order: "asc" }),
    });
    expect(ids(asc)).toEqual(["fp-3", "fp-1", "fp-2"]);
  });

  it("published-sort excludes never-published drafts in both directions", async () => {
    // s-04 (never published) is absent from the index; s-07 (deleted) is in
    // the index but excluded by the predicate; s-05 (once-published draft)
    // is present.
    const desc = await dbGetPosts("proj-sort", {
      limit: 10,
      listPrefs: listPrefs({ sort: "datePublished" }),
    });
    expect(ids(desc)).toEqual(["s-02", "s-06", "s-03", "s-05", "s-01"]);

    const asc = await dbGetPosts("proj-sort", {
      limit: 10,
      listPrefs: listPrefs({ sort: "datePublished", order: "asc" }),
    });
    expect(ids(asc)).toEqual(["s-01", "s-05", "s-03", "s-06", "s-02"]);
  });

  it("published-sort + drafts filter shows only once-published drafts", async () => {
    const page = await dbGetPosts("proj-sort", {
      limit: 10,
      listPrefs: listPrefs({ sort: "datePublished", draft: "drafts" }),
    });
    expect(ids(page)).toEqual(["s-05"]);
  });

  it("filters: drafts / published / pages / posts / combined", async () => {
    const q = (listPrefs_: IPostsListPrefs) =>
      dbGetPosts("proj-sort", { limit: 10, listPrefs: listPrefs_ }).then(ids);

    expect(await q(listPrefs({ draft: "drafts" }))).toEqual(["s-04", "s-05"]);
    expect(await q(listPrefs({ draft: "published" }))).toEqual([
      "s-02",
      "s-06",
      "s-03",
      "s-01",
    ]);
    expect(await q(listPrefs({ page: "pages" }))).toEqual(["s-06"]);
    expect(await q(listPrefs({ page: "posts" }))).toEqual([
      "s-04",
      "s-02",
      "s-03",
      "s-05",
      "s-01",
    ]);
    expect(await q(listPrefs({ draft: "published", page: "pages" }))).toEqual([
      "s-06",
    ]);
    expect(await q(listPrefs({ draft: "drafts", page: "pages" }))).toEqual([]);
  });

  it("paginates filtered lists by counting matches, not raw records", async () => {
    const prefs = listPrefs({ page: "posts" });
    const page1 = await dbGetPosts("proj-sort", {
      limit: 2,
      offset: 0,
      listPrefs: prefs,
    });
    const page2 = await dbGetPosts("proj-sort", {
      limit: 2,
      offset: 2,
      listPrefs: prefs,
    });
    const page3 = await dbGetPosts("proj-sort", {
      limit: 2,
      offset: 4,
      listPrefs: prefs,
    });
    expect(ids(page1)).toEqual(["s-04", "s-02"]);
    expect(ids(page2)).toEqual(["s-03", "s-05"]);
    expect(ids(page3)).toEqual(["s-01"]);
  });

  it("same-day ties follow cursor direction (id desc in desc, id asc in asc)", async () => {
    // proj-1's 20 posts all share dateCreated=2026-01-01.
    const asc = await dbGetPosts("proj-1", {
      limit: 5,
      listPrefs: listPrefs({ order: "asc" }),
    });
    expect(ids(asc)).toEqual([
      "post-01",
      "post-02",
      "post-03",
      "post-04",
      "post-05",
    ]);
  });

  it("never leaks other projects' posts under sort + filter", async () => {
    const page = await dbGetPosts("proj-sort", {
      limit: 100,
      listPrefs: listPrefs({ sort: "dateUpdated", draft: "published" }),
    });
    expect(page.length).toBeGreaterThan(0);
    expect(page.every((p) => p.projectId === "proj-sort")).toBe(true);
  });

  it("record missing dateUpdated is invisible to updated-sort only (documented limitation)", async () => {
    const created = await dbGetPosts("proj-nodate", { limit: 10 });
    expect(ids(created)).toEqual(["s-nd"]);
    const updated = await dbGetPosts("proj-nodate", {
      limit: 10,
      listPrefs: listPrefs({ sort: "dateUpdated" }),
    });
    expect(updated).toEqual([]);
  });
});

describe("dbGetPostPage with listPrefs", () => {
  it("computes position under a non-default sort", async () => {
    // updated-desc: [s-01, s-03, s-02, s-05, s-06, s-04] → s-06 at position 4
    expect(
      await dbGetPostPage(
        "proj-sort",
        "s-06",
        2,
        listPrefs({ sort: "dateUpdated" }),
      ),
    ).toBe(3);
  });

  it("an active filter changes the page", async () => {
    // created-desc, no filter: s-05 at position 4 → page 5 (pageSize 1)
    expect(await dbGetPostPage("proj-sort", "s-05", 1)).toBe(5);
    // drafts-only: [s-04, s-05] → s-05 at position 1 → page 2
    expect(
      await dbGetPostPage(
        "proj-sort",
        "s-05",
        1,
        listPrefs({ draft: "drafts" }),
      ),
    ).toBe(2);
  });

  it("returns null when the post is filtered out", async () => {
    expect(
      await dbGetPostPage(
        "proj-sort",
        "s-01",
        5,
        listPrefs({ draft: "drafts" }),
      ),
    ).toBeNull();
  });

  it("returns null for a never-published draft under published-sort", async () => {
    expect(
      await dbGetPostPage(
        "proj-sort",
        "s-04",
        5,
        listPrefs({ sort: "datePublished" }),
      ),
    ).toBeNull();
  });

  it("locates a published post under published-sort", async () => {
    // published-desc: [s-02, s-06, s-03, s-05, s-01] → s-03 at position 2
    expect(
      await dbGetPostPage(
        "proj-sort",
        "s-03",
        2,
        listPrefs({ sort: "datePublished" }),
      ),
    ).toBe(2);
  });
});

describe("dbGetProjectTags", () => {
  beforeAll(async () => {
    await dbSavePost(makePost("t-01", "proj-tags", { tags: ["js", "svelte"] }));
    await dbSavePost(
      makePost("t-02", "proj-tags", { tags: ["svelte", "kit"] }),
    );
    // tombstone: its unique tag must not surface
    await dbSavePost(
      makePost("t-03", "proj-tags", { tags: ["ghost", "js"], deleted: true }),
    );
    await dbSavePost(makePost("t-04", "proj-tags")); // no tags
    await dbSavePost(makePost("t-05", "proj-other", { tags: ["other"] }));
  });

  it("returns distinct, sorted tags for the project", async () => {
    expect(await dbGetProjectTags("proj-tags")).toEqual([
      "js",
      "kit",
      "svelte",
    ]);
  });

  it("is scoped to the project", async () => {
    expect(await dbGetProjectTags("proj-other")).toEqual(["other"]);
  });

  it("returns [] for a project with no tagged posts", async () => {
    expect(await dbGetProjectTags("proj-empty")).toEqual([]);
  });
});
